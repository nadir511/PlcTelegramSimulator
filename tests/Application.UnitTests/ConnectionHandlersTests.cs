using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Application.Connection;
using PlcTelegramSimulator.Application.Messaging;
using PlcTelegramSimulator.Application.UnitTests.Fakes;
using PlcTelegramSimulator.Domain;

namespace PlcTelegramSimulator.Application.UnitTests;

public sealed class ConnectionHandlersTests
{
    private static ListenerConfig SampleConfig() =>
        ListenerConfig.Create("0.0.0.0", sendPort: 2000, receivePort: 2001, processingDelayMs: 50, autoAcceptReconnections: true);

    private static ServiceProvider BuildProvider(FakeTransport transport, FakeBroadcaster broadcaster)
    {
        var services = new ServiceCollection();
        services.AddSingleton(typeof(ILogger<>), typeof(NullLogger<>));
        services.AddSingleton<IPlcTransport>(transport);
        services.AddSingleton<IConnectionBroadcaster>(broadcaster);
        services.AddApplication();
        return services.BuildServiceProvider();
    }

    [Fact]
    public async Task StartListenerCommand_InvokesTransportStart()
    {
        var transport = new FakeTransport();
        await using var provider = BuildProvider(transport, new FakeBroadcaster());
        using var scope = provider.CreateScope();
        var sender = scope.ServiceProvider.GetRequiredService<ISender>();

        var config = SampleConfig();
        await sender.Send(new StartListenerCommand(config), CancellationToken.None);

        Assert.Single(transport.StartCalls);
        Assert.Same(config, transport.StartCalls[0]);
    }

    [Fact]
    public async Task StopListenerCommand_InvokesTransportStop()
    {
        var transport = new FakeTransport();
        await using var provider = BuildProvider(transport, new FakeBroadcaster());
        using var scope = provider.CreateScope();
        var sender = scope.ServiceProvider.GetRequiredService<ISender>();

        await sender.Send(new StopListenerCommand(), CancellationToken.None);

        Assert.Equal(1, transport.StopCallCount);
    }

    [Fact]
    public async Task SendTelegramCommand_InvokesTransportSend()
    {
        var transport = new FakeTransport();
        await using var provider = BuildProvider(transport, new FakeBroadcaster());
        using var scope = provider.CreateScope();
        var sender = scope.ServiceProvider.GetRequiredService<ISender>();

        var payload = new byte[] { 0x01, 0x02 };
        await sender.Send(new SendTelegramCommand(payload), CancellationToken.None);

        Assert.Single(transport.SendCalls);
        Assert.Equal(payload, transport.SendCalls[0]);
    }

    [Fact]
    public async Task SendTelegramCommand_WhenConnected_ReportsPeerConnected()
    {
        var transport = new FakeTransport();
        await using var provider = BuildProvider(transport, new FakeBroadcaster());
        var state = provider.GetRequiredService<ConnectionState>();
        await state.StartAsync(CancellationToken.None);

        try
        {
            transport.RaiseStatus(ListenerStatus.Connected, null);

            using var scope = provider.CreateScope();
            var sender = scope.ServiceProvider.GetRequiredService<ISender>();
            var result = await sender.Send(new SendTelegramCommand(new byte[] { 0x06 }), CancellationToken.None);

            Assert.True(result.PeerConnected);
        }
        finally
        {
            await state.StopAsync(CancellationToken.None);
        }
    }

    [Fact]
    public async Task SendTelegramCommand_WhenNotConnected_ReportsNoPeer()
    {
        var transport = new FakeTransport();
        await using var provider = BuildProvider(transport, new FakeBroadcaster());
        var state = provider.GetRequiredService<ConnectionState>();
        await state.StartAsync(CancellationToken.None);

        try
        {
            transport.RaiseStatus(ListenerStatus.Listening, null);

            using var scope = provider.CreateScope();
            var sender = scope.ServiceProvider.GetRequiredService<ISender>();
            var result = await sender.Send(new SendTelegramCommand(new byte[] { 0x06 }), CancellationToken.None);

            Assert.False(result.PeerConnected);
            // The command still dispatches to the transport so the "no client" event fires.
            Assert.Single(transport.SendCalls);
        }
        finally
        {
            await state.StopAsync(CancellationToken.None);
        }
    }

    [Fact]
    public async Task GetStatusQuery_ReturnsCurrentSnapshot()
    {
        var transport = new FakeTransport();
        await using var provider = BuildProvider(transport, new FakeBroadcaster());
        var state = provider.GetRequiredService<ConnectionState>();
        await state.StartAsync(CancellationToken.None);

        try
        {
            transport.RaiseStatus(ListenerStatus.Error, "boom");

            using var scope = provider.CreateScope();
            var sender = scope.ServiceProvider.GetRequiredService<ISender>();
            var snapshot = await sender.Send(new GetStatusQuery(), CancellationToken.None);

            Assert.Equal(ListenerStatus.Error, snapshot.Status);
            Assert.Equal("boom", snapshot.Error);
        }
        finally
        {
            await state.StopAsync(CancellationToken.None);
        }
    }
}

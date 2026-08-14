using Microsoft.Extensions.DependencyInjection;
using PlcTelegramSimulator.Application.Messaging;

namespace PlcTelegramSimulator.Application.UnitTests;

public sealed class SenderTests
{
    [Fact]
    public async Task Send_ResolvesAndInvokesRegisteredHandler()
    {
        var services = new ServiceCollection();
        services.AddScoped<ISender, Sender>();
        services.AddScoped<IRequestHandler<PingQuery, string>, PingQueryHandler>();
        using var provider = services.BuildServiceProvider();

        var sender = provider.GetRequiredService<ISender>();
        var result = await sender.Send(new PingQuery("hello"), CancellationToken.None);

        Assert.Equal("handled:hello", result);
    }

    [Fact]
    public async Task Send_WithNoRegisteredHandler_Throws()
    {
        var services = new ServiceCollection();
        services.AddScoped<ISender, Sender>();
        using var provider = services.BuildServiceProvider();

        var sender = provider.GetRequiredService<ISender>();

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => sender.Send(new PingQuery("x"), CancellationToken.None));
    }

    [Fact]
    public async Task Send_PassesCancellationTokenToHandler()
    {
        var services = new ServiceCollection();
        services.AddScoped<ISender, Sender>();
        services.AddScoped<IRequestHandler<TokenProbeQuery, bool>, TokenProbeQueryHandler>();
        using var provider = services.BuildServiceProvider();
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        var sender = provider.GetRequiredService<ISender>();
        var sawCancellation = await sender.Send(new TokenProbeQuery(), cts.Token);

        Assert.True(sawCancellation);
    }

    private sealed record PingQuery(string Value) : IRequest<string>;

    private sealed class PingQueryHandler : IRequestHandler<PingQuery, string>
    {
        public Task<string> Handle(PingQuery request, CancellationToken cancellationToken) =>
            Task.FromResult($"handled:{request.Value}");
    }

    private sealed record TokenProbeQuery : IRequest<bool>;

    private sealed class TokenProbeQueryHandler : IRequestHandler<TokenProbeQuery, bool>
    {
        public Task<bool> Handle(TokenProbeQuery request, CancellationToken cancellationToken) =>
            Task.FromResult(cancellationToken.IsCancellationRequested);
    }
}

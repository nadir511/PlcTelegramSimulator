using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using PlcTelegramSimulator.Infrastructure.IntegrationTests.Fakes;
using PlcTelegramSimulator.Infrastructure.Transport.Simulation;

namespace PlcTelegramSimulator.Infrastructure.IntegrationTests;

public sealed class TcpInboundTelegramRouterTests
{
    private static TcpInboundTelegramRouter Build(
        out FakePlcTransport transport, out FakeSimulationEngine engine)
    {
        transport = new FakePlcTransport();
        engine = new FakeSimulationEngine();
        return new TcpInboundTelegramRouter(
            transport, engine, NullLogger<TcpInboundTelegramRouter>.Instance);
    }

    [Fact]
    public async Task Acknowledgement_FeedsEngineAcknowledge()
    {
        var router = Build(out var transport, out var engine);
        await router.StartAsync(CancellationToken.None);

        transport.RaiseTelegram(Encoding.ASCII.GetBytes("ACK|5|A"));

        Assert.Equal(5, Assert.Single(engine.Acknowledged));
        Assert.Empty(engine.Resolved);
    }

    [Fact]
    public async Task TransportOrder_FeedsEngineResolve()
    {
        var router = Build(out var transport, out var engine);
        await router.StartAsync(CancellationToken.None);

        transport.RaiseTelegram(Encoding.ASCII.GetBytes("TO|5|DEST-Z"));

        var (telegramId, destination, destinationMp) = Assert.Single(engine.Resolved);
        Assert.Equal(5, telegramId);
        Assert.Equal("DEST-Z", destination);
        Assert.Null(destinationMp);
        Assert.Empty(engine.Acknowledged);
    }

    [Fact]
    public async Task FourPartTransportOrder_FeedsEngineResolve_WithNextMp()
    {
        var router = Build(out var transport, out var engine);
        await router.StartAsync(CancellationToken.None);

        transport.RaiseTelegram(Encoding.ASCII.GetBytes("TO|7|SORTER_3|MP-12"));

        var (telegramId, destination, destinationMp) = Assert.Single(engine.Resolved);
        Assert.Equal(7, telegramId);
        Assert.Equal("SORTER_3", destination);
        Assert.Equal("MP-12", destinationMp);
        Assert.Empty(engine.Acknowledged);
    }

    [Fact]
    public async Task RawAckSentinel_IsIgnored()
    {
        var router = Build(out var transport, out var engine);
        await router.StartAsync(CancellationToken.None);

        transport.RaiseTelegram(new byte[] { 0x06 });

        Assert.Empty(engine.Acknowledged);
        Assert.Empty(engine.Resolved);
    }

    [Fact]
    public async Task BeforeStart_TelegramsAreNotRouted()
    {
        var router = Build(out var transport, out var engine);

        transport.RaiseTelegram(Encoding.ASCII.GetBytes("ACK|5|A"));

        Assert.Empty(engine.Acknowledged);
        await router.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task AfterStop_UnsubscribesFromTransport()
    {
        var router = Build(out var transport, out var engine);
        await router.StartAsync(CancellationToken.None);
        await router.StopAsync(CancellationToken.None);

        transport.RaiseTelegram(Encoding.ASCII.GetBytes("ACK|5|A"));

        Assert.Empty(engine.Acknowledged);
    }
}

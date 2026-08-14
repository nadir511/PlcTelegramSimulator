using Microsoft.Extensions.Logging.Abstractions;
using PlcTelegramSimulator.Application.Simulation;
using PlcTelegramSimulator.Application.UnitTests.Fakes;

namespace PlcTelegramSimulator.Application.UnitTests.Simulation;

public sealed class MpOrchestratorTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    private static MpOrchestrator Build(
        out FakeMpTelegramGateway gateway,
        out FakeSimulationEventPublisher publisher,
        out ManualTimeProvider time,
        MpOrchestratorOptions? options = null)
    {
        gateway = new FakeMpTelegramGateway();
        publisher = new FakeSimulationEventPublisher();
        time = new ManualTimeProvider(T0);
        return new MpOrchestrator(
            gateway, publisher, time, options ?? new MpOrchestratorOptions(), NullLogger<MpOrchestrator>.Instance);
    }

    [Fact]
    public async Task ReportArrival_SendsMpTelegram_AndNotifiesCanvas()
    {
        var orchestrator = Build(out var gateway, out var publisher, out _);

        var telegramId = await orchestrator.ReportArrivalAsync("TU-1", "MP1", CancellationToken.None);

        Assert.NotNull(telegramId);
        var sent = Assert.Single(gateway.Sent);
        Assert.Equal(telegramId, sent.TelegramId);
        Assert.Equal("TU-1", sent.TransportUnitId);
        Assert.Equal("MP1", sent.MessagePointId);
        Assert.Single(publisher.MpReports);
        Assert.Equal(1, orchestrator.OutstandingCount);
    }

    [Fact]
    public async Task ReportArrival_SameBinTwice_SendsOnce()
    {
        var orchestrator = Build(out var gateway, out _, out _);

        await orchestrator.ReportArrivalAsync("TU-1", "MP1", CancellationToken.None);
        var second = await orchestrator.ReportArrivalAsync("TU-1", "MP1", CancellationToken.None);

        Assert.Null(second);
        Assert.Single(gateway.Sent);
        Assert.Equal(1, orchestrator.OutstandingCount);
    }

    [Fact]
    public async Task Resolve_MatchesByTelegramId_AndPushesDestination()
    {
        var orchestrator = Build(out _, out var publisher, out _);
        var telegramId = await orchestrator.ReportArrivalAsync("TU-1", "MP1", CancellationToken.None);
        orchestrator.Acknowledge(telegramId!.Value);

        await orchestrator.ResolveAsync(telegramId.Value, "DEST-Z", CancellationToken.None);

        var order = Assert.Single(publisher.TransportOrders);
        Assert.Equal("TU-1", order.TransportUnitId);
        Assert.Equal("MP1", order.MessagePointId);
        Assert.Equal("DEST-Z", order.Destination);
        Assert.Equal(0, orchestrator.OutstandingCount);
    }

    [Fact]
    public async Task Resolve_OutOfOrder_MatchesEachRequest()
    {
        var orchestrator = Build(out _, out var publisher, out _);
        var a = await orchestrator.ReportArrivalAsync("TU-A", "MP1", CancellationToken.None);
        var b = await orchestrator.ReportArrivalAsync("TU-B", "MP3", CancellationToken.None);

        // The transport order for B arrives before A's.
        await orchestrator.ResolveAsync(b!.Value, "DEST-B", CancellationToken.None);
        await orchestrator.ResolveAsync(a!.Value, "DEST-A", CancellationToken.None);

        Assert.Equal(2, publisher.TransportOrders.Count);
        Assert.Equal("TU-B", publisher.TransportOrders[0].TransportUnitId);
        Assert.Equal("DEST-B", publisher.TransportOrders[0].Destination);
        Assert.Equal("TU-A", publisher.TransportOrders[1].TransportUnitId);
        Assert.Equal("DEST-A", publisher.TransportOrders[1].Destination);
    }

    [Fact]
    public async Task Resolve_UnknownTelegramId_IsIgnored()
    {
        var orchestrator = Build(out _, out var publisher, out _);

        await orchestrator.ResolveAsync(4242, "DEST", CancellationToken.None);

        Assert.Empty(publisher.TransportOrders);
    }

    [Fact]
    public async Task Resolve_DuplicateTo_PushesOnce()
    {
        var orchestrator = Build(out _, out var publisher, out _);
        var id = await orchestrator.ReportArrivalAsync("TU-1", "MP1", CancellationToken.None);

        await orchestrator.ResolveAsync(id!.Value, "DEST-Z", CancellationToken.None);
        await orchestrator.ResolveAsync(id.Value, "DEST-Z", CancellationToken.None);

        Assert.Single(publisher.TransportOrders);
    }

    [Fact]
    public async Task CheckTimeouts_MissingAck_FaultsWithAckReason()
    {
        var options = new MpOrchestratorOptions { AcknowledgementTimeout = TimeSpan.FromSeconds(2) };
        var orchestrator = Build(out _, out var publisher, out var time, options);
        await orchestrator.ReportArrivalAsync("TU-1", "MP1", CancellationToken.None);

        time.Advance(TimeSpan.FromSeconds(3));
        await orchestrator.CheckTimeoutsAsync(CancellationToken.None);

        var timedOut = Assert.Single(publisher.Timeouts);
        Assert.Equal(MpTimeoutReason.Acknowledgement, timedOut.Reason);
        Assert.Equal(0, orchestrator.OutstandingCount);
    }

    [Fact]
    public async Task CheckTimeouts_MissingTo_FaultsWithToReason()
    {
        var options = new MpOrchestratorOptions
        {
            AcknowledgementTimeout = TimeSpan.FromSeconds(2),
            TransportOrderTimeout = TimeSpan.FromSeconds(10),
        };
        var orchestrator = Build(out _, out var publisher, out var time, options);
        var id = await orchestrator.ReportArrivalAsync("TU-1", "MP1", CancellationToken.None);
        orchestrator.Acknowledge(id!.Value);

        time.Advance(TimeSpan.FromSeconds(11));
        await orchestrator.CheckTimeoutsAsync(CancellationToken.None);

        var timedOut = Assert.Single(publisher.Timeouts);
        Assert.Equal(MpTimeoutReason.TransportOrder, timedOut.Reason);
    }

    [Fact]
    public async Task ReportArrival_AllocatesUniqueTelegramIds()
    {
        var orchestrator = Build(out _, out _, out _);

        var a = await orchestrator.ReportArrivalAsync("TU-A", "MP1", CancellationToken.None);
        var b = await orchestrator.ReportArrivalAsync("TU-B", "MP2", CancellationToken.None);

        Assert.NotEqual(a, b);
    }
}

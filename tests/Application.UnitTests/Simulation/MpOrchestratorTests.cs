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

        var telegramId = await orchestrator.ReportArrivalAsync("TU-1", "MP1", telegramId: null, telegram: null, CancellationToken.None);

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

        await orchestrator.ReportArrivalAsync("TU-1", "MP1", telegramId: null, telegram: null, CancellationToken.None);
        var second = await orchestrator.ReportArrivalAsync("TU-1", "MP1", telegramId: null, telegram: null, CancellationToken.None);

        Assert.Null(second);
        Assert.Single(gateway.Sent);
        Assert.Equal(1, orchestrator.OutstandingCount);
    }

    [Fact]
    public async Task ReportArrival_ReusedIdAfterRestart_SupersedesStaleRequestAndStillSends()
    {
        // A prior run left id 1 held/faulted for TU-OLD; a restart re-mints id 1 for a new TU.
        // The reused id must supersede the stale entry rather than drop the new arrival (ADR-0009).
        var orchestrator = Build(out var gateway, out var publisher, out _);
        await orchestrator.ReportArrivalAsync("TU-OLD", "MP1", telegramId: 1, telegram: null, CancellationToken.None);

        var second = await orchestrator.ReportArrivalAsync("TU-NEW", "MP1", telegramId: 1, telegram: null, CancellationToken.None);

        Assert.Equal(1, second);
        Assert.Equal(2, gateway.Sent.Count);
        Assert.Equal("TU-NEW", gateway.Sent[^1].TransportUnitId);
        Assert.Equal(1, orchestrator.OutstandingCount);

        // The fresh (TU-NEW) request is the one now correlatable under id 1.
        await orchestrator.ResolveAsync(1, "DEST-Z", destinationMp: null, CancellationToken.None);
        Assert.Equal("TU-NEW", Assert.Single(publisher.TransportOrders).TransportUnitId);
    }

    [Fact]
    public async Task Resolve_MatchesByTelegramId_AndPushesDestination()
    {
        var orchestrator = Build(out _, out var publisher, out _);
        var telegramId = await orchestrator.ReportArrivalAsync("TU-1", "MP1", telegramId: null, telegram: null, CancellationToken.None);
        orchestrator.Acknowledge(telegramId!.Value);

        await orchestrator.ResolveAsync(telegramId.Value, "DEST-Z", destinationMp: null, CancellationToken.None);

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
        var a = await orchestrator.ReportArrivalAsync("TU-A", "MP1", telegramId: null, telegram: null, CancellationToken.None);
        var b = await orchestrator.ReportArrivalAsync("TU-B", "MP3", telegramId: null, telegram: null, CancellationToken.None);

        // The transport order for B arrives before A's.
        await orchestrator.ResolveAsync(b!.Value, "DEST-B", destinationMp: null, CancellationToken.None);
        await orchestrator.ResolveAsync(a!.Value, "DEST-A", destinationMp: null, CancellationToken.None);

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

        await orchestrator.ResolveAsync(4242, "DEST", destinationMp: null, CancellationToken.None);

        Assert.Empty(publisher.TransportOrders);
    }

    [Fact]
    public async Task Resolve_DuplicateTo_PushesOnce()
    {
        var orchestrator = Build(out _, out var publisher, out _);
        var id = await orchestrator.ReportArrivalAsync("TU-1", "MP1", telegramId: null, telegram: null, CancellationToken.None);

        await orchestrator.ResolveAsync(id!.Value, "DEST-Z", destinationMp: null, CancellationToken.None);
        await orchestrator.ResolveAsync(id.Value, "DEST-Z", destinationMp: null, CancellationToken.None);

        Assert.Single(publisher.TransportOrders);
    }

    [Fact]
    public async Task CheckTimeouts_MissingAck_FaultsWithAckReason()
    {
        var options = new MpOrchestratorOptions { AcknowledgementTimeout = TimeSpan.FromSeconds(2) };
        var orchestrator = Build(out _, out var publisher, out var time, options);
        await orchestrator.ReportArrivalAsync("TU-1", "MP1", telegramId: null, telegram: null, CancellationToken.None);

        time.Advance(TimeSpan.FromSeconds(3));
        await orchestrator.CheckTimeoutsAsync(CancellationToken.None);

        var timedOut = Assert.Single(publisher.Timeouts);
        Assert.Equal(MpTimeoutReason.Acknowledgement, timedOut.Reason);

        // ADR-0015 "hold": the request is retained (not released) so a late TO can still resolve it.
        Assert.Equal(1, orchestrator.OutstandingCount);
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
        var id = await orchestrator.ReportArrivalAsync("TU-1", "MP1", telegramId: null, telegram: null, CancellationToken.None);
        orchestrator.Acknowledge(id!.Value);

        time.Advance(TimeSpan.FromSeconds(11));
        await orchestrator.CheckTimeoutsAsync(CancellationToken.None);

        var timedOut = Assert.Single(publisher.Timeouts);
        Assert.Equal(MpTimeoutReason.TransportOrder, timedOut.Reason);
    }

    [Fact]
    public async Task Resolve_WithDestinationMp_PopulatesTransportOrder()
    {
        var orchestrator = Build(out _, out var publisher, out _);
        var id = await orchestrator.ReportArrivalAsync("TU-1", "MP1", telegramId: null, telegram: null, CancellationToken.None);

        await orchestrator.ResolveAsync(id!.Value, "SORTER_3", "MP-12", CancellationToken.None);

        var order = Assert.Single(publisher.TransportOrders);
        Assert.Equal("SORTER_3", order.Destination);
        Assert.Equal("MP-12", order.DestinationMp);
    }

    [Fact]
    public async Task Resolve_WithoutDestinationMp_LeavesItNull()
    {
        var orchestrator = Build(out _, out var publisher, out _);
        var id = await orchestrator.ReportArrivalAsync("TU-1", "MP1", telegramId: null, telegram: null, CancellationToken.None);

        await orchestrator.ResolveAsync(id!.Value, "SORTER_3", destinationMp: null, CancellationToken.None);

        var order = Assert.Single(publisher.TransportOrders);
        Assert.Null(order.DestinationMp);
    }

    [Fact]
    public async Task Resolve_AfterTimeoutFault_StillReleasesBin_WithDestinationMp()
    {
        // A transport-order-only outer client sends no ACK, so the short ACK deadline fires first.
        // ADR-0015 "hold": the fault must not strand the request; a later genuine TO still resolves it.
        var options = new MpOrchestratorOptions { AcknowledgementTimeout = TimeSpan.FromSeconds(2) };
        var orchestrator = Build(out _, out var publisher, out var time, options);
        var id = await orchestrator.ReportArrivalAsync("TU-1", "MP1", telegramId: null, telegram: null, CancellationToken.None);

        time.Advance(TimeSpan.FromSeconds(3));
        await orchestrator.CheckTimeoutsAsync(CancellationToken.None);

        // The bin faulted but is held; a real transport order arrives afterwards.
        await orchestrator.ResolveAsync(id!.Value, "SORTER_3", "MP-12", CancellationToken.None);

        Assert.Single(publisher.Timeouts);
        var order = Assert.Single(publisher.TransportOrders);
        Assert.Equal("TU-1", order.TransportUnitId);
        Assert.Equal("SORTER_3", order.Destination);
        Assert.Equal("MP-12", order.DestinationMp);
        Assert.Equal(0, orchestrator.OutstandingCount);
    }

    [Fact]
    public async Task ReportArrival_AllocatesUniqueTelegramIds()
    {
        var orchestrator = Build(out _, out _, out _);

        var a = await orchestrator.ReportArrivalAsync("TU-A", "MP1", telegramId: null, telegram: null, CancellationToken.None);
        var b = await orchestrator.ReportArrivalAsync("TU-B", "MP2", telegramId: null, telegram: null, CancellationToken.None);

        Assert.NotEqual(a, b);
    }

    [Fact]
    public async Task ReportArrival_ThreadsEncodedTelegram_AndUsesProvidedId()
    {
        var orchestrator = Build(out var gateway, out _, out _);
        var encoded = new EncodedMpTelegram(new byte[] { 10, 20, 30, 40 });

        var id = await orchestrator.ReportArrivalAsync(
            "TU-1", "MP1", telegramId: 4242, encoded, CancellationToken.None);

        var sent = Assert.Single(gateway.Sent);
        Assert.Same(encoded, sent.Encoded);
        Assert.Equal(4242, id);
        Assert.Equal(4242, sent.TelegramId);
    }
}

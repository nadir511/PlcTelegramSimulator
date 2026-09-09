using PlcTelegramSimulator.Application.Simulation;

namespace PlcTelegramSimulator.Application.UnitTests.Simulation;

public sealed class PendingRequestRegistryTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    private static PendingMpRequest NewRequest(int id, string tu = "TU1", string mp = "MP1") =>
        PendingMpRequest.Create(new MpTelegram(id, tu, mp), T0);

    [Fact]
    public void Register_ThenResolve_ReturnsAndRemoves()
    {
        var registry = new PendingRequestRegistry();
        registry.Register(NewRequest(1));

        var resolved = registry.Resolve(1);

        Assert.NotNull(resolved);
        Assert.Equal(MpRequestPhase.Resolved, resolved!.Phase);
        Assert.Equal(0, registry.Count);
    }

    [Fact]
    public void Register_DuplicateTelegramId_SupersedesStaleRequestAndReturnsIt()
    {
        var registry = new PendingRequestRegistry();
        Assert.Null(registry.Register(NewRequest(1, tu: "TU-OLD")));

        // A reused id (e.g. after a simulation restart) evicts the stale entry rather than throwing.
        var superseded = registry.Register(NewRequest(1, tu: "TU-NEW"));

        Assert.NotNull(superseded);
        Assert.Equal("TU-OLD", superseded!.TransportUnitId);
        Assert.Equal(1, registry.Count);

        var resolved = registry.Resolve(1);
        Assert.Equal("TU-NEW", resolved!.TransportUnitId);
    }

    [Fact]
    public void Resolve_UnknownTelegramId_ReturnsNull()
    {
        var registry = new PendingRequestRegistry();

        Assert.Null(registry.Resolve(99));
    }

    [Fact]
    public void TryAcknowledge_Unknown_ReturnsFalse()
    {
        var registry = new PendingRequestRegistry();

        Assert.False(registry.TryAcknowledge(1, T0));
    }

    [Fact]
    public void TryAcknowledge_MovesToAcknowledged_AndStampsTime()
    {
        var registry = new PendingRequestRegistry();
        registry.Register(NewRequest(1));

        Assert.True(registry.TryAcknowledge(1, T0.AddSeconds(1)));

        var resolved = registry.Resolve(1);
        Assert.Equal(MpRequestPhase.Resolved, resolved!.Phase);
        Assert.Equal(T0.AddSeconds(1), resolved.AcknowledgedAt);
    }

    [Fact]
    public void HasOutstandingFor_TracksByTransportUnit()
    {
        var registry = new PendingRequestRegistry();
        registry.Register(NewRequest(1, tu: "TU-A"));

        Assert.True(registry.HasOutstandingFor("TU-A"));
        Assert.False(registry.HasOutstandingFor("TU-B"));

        registry.Resolve(1);
        Assert.False(registry.HasOutstandingFor("TU-A"));
    }

    [Fact]
    public void CollectExpired_PendingAckPastAckTimeout_ReportsAckReason_AndRetains()
    {
        var registry = new PendingRequestRegistry();
        registry.Register(NewRequest(1));

        var expired = registry.CollectExpired(T0.AddSeconds(3), TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(10));

        var only = Assert.Single(expired);
        Assert.Equal(MpTimeoutReason.Acknowledgement, only.Reason);

        // ADR-0015 "hold": the faulted request is retained so a late TO can still resolve it.
        Assert.Equal(1, registry.Count);
    }

    [Fact]
    public void CollectExpired_FaultsAtMostOnce()
    {
        var registry = new PendingRequestRegistry();
        registry.Register(NewRequest(1));

        var first = registry.CollectExpired(T0.AddSeconds(3), TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(10));
        var second = registry.CollectExpired(T0.AddSeconds(30), TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(10));

        Assert.Single(first);
        Assert.Empty(second);
        Assert.Equal(1, registry.Count);
    }

    [Fact]
    public void Resolve_AfterFault_StillReturnsAndRemoves()
    {
        var registry = new PendingRequestRegistry();
        registry.Register(NewRequest(1));
        registry.CollectExpired(T0.AddSeconds(3), TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(10));

        var resolved = registry.Resolve(1);

        Assert.NotNull(resolved);
        Assert.Equal(MpRequestPhase.Resolved, resolved!.Phase);
        Assert.Equal(0, registry.Count);
    }

    [Fact]
    public void CollectExpired_AcknowledgedPastToTimeout_ReportsToReason()
    {
        var registry = new PendingRequestRegistry();
        registry.Register(NewRequest(1));
        registry.TryAcknowledge(1, T0.AddSeconds(1));

        var expired = registry.CollectExpired(T0.AddSeconds(12), TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(10));

        var only = Assert.Single(expired);
        Assert.Equal(MpTimeoutReason.TransportOrder, only.Reason);
    }

    [Fact]
    public void CollectExpired_WithinTimeouts_ReturnsNothing()
    {
        var registry = new PendingRequestRegistry();
        registry.Register(NewRequest(1));
        registry.TryAcknowledge(1, T0.AddSeconds(1));

        var expired = registry.CollectExpired(T0.AddSeconds(5), TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(10));

        Assert.Empty(expired);
        Assert.Equal(1, registry.Count);
    }
}

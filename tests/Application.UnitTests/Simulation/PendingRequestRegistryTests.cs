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
    public void Register_DuplicateTelegramId_Throws()
    {
        var registry = new PendingRequestRegistry();
        registry.Register(NewRequest(1));

        Assert.Throws<InvalidOperationException>(() => registry.Register(NewRequest(1)));
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
    public void CollectExpired_PendingAckPastAckTimeout_ReportsAckReason()
    {
        var registry = new PendingRequestRegistry();
        registry.Register(NewRequest(1));

        var expired = registry.CollectExpired(T0.AddSeconds(3), TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(10));

        var only = Assert.Single(expired);
        Assert.Equal(MpTimeoutReason.Acknowledgement, only.Reason);
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

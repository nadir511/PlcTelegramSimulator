namespace PlcTelegramSimulator.Domain.Simulation;

/// <summary>
/// Pure, immutable state machine for a bin's routing lifecycle (ADR-0012). Every transition
/// returns a new instance and rejects illegal moves with an <see cref="InvalidOperationException"/>,
/// so the simulation loop can rely on the Domain to enforce the legal transition graph without any
/// I/O. The MP/TO handshake is the band <see cref="BinRoutingStatus.AtMessagePoint"/> →
/// <see cref="BinRoutingStatus.AwaitingTransportOrder"/> → <see cref="BinRoutingStatus.Routing"/>.
/// </summary>
public sealed record BinRoutingState
{
    private BinRoutingState(BinRoutingStatus status) => Status = status;

    /// <summary>The current lifecycle status.</summary>
    public BinRoutingStatus Status { get; }

    /// <summary>A bin enters the system <see cref="BinRoutingStatus.Moving"/>.</summary>
    public static BinRoutingState Start() => new(BinRoutingStatus.Moving);

    /// <summary>Zone ahead became occupied while moving.</summary>
    public BinRoutingState Block() => To(BinRoutingStatus.Blocked, BinRoutingStatus.Moving);

    /// <summary>Zone ahead cleared; resume moving.</summary>
    public BinRoutingState Unblock() => To(BinRoutingStatus.Moving, BinRoutingStatus.Blocked);

    /// <summary>Reached a message point and parked on it.</summary>
    public BinRoutingState ArriveAtMessagePoint() => To(BinRoutingStatus.AtMessagePoint, BinRoutingStatus.Moving);

    /// <summary>MP telegram sent (Status N) and acknowledged (Status A); now awaiting the transport order.</summary>
    public BinRoutingState AwaitTransportOrder() => To(BinRoutingStatus.AwaitingTransportOrder, BinRoutingStatus.AtMessagePoint);

    /// <summary>Transport order received; the bin is routing toward its destination.</summary>
    public BinRoutingState ApplyTransportOrder() => To(BinRoutingStatus.Routing, BinRoutingStatus.AwaitingTransportOrder);

    /// <summary>Transport order timed out; move to exception handling.</summary>
    public BinRoutingState FaultTransportOrder() => To(BinRoutingStatus.Exception, BinRoutingStatus.AwaitingTransportOrder);

    /// <summary>Exception handled (default lane / retry); resume routing.</summary>
    public BinRoutingState ResolveException() => To(BinRoutingStatus.Routing, BinRoutingStatus.Exception);

    /// <summary>Released from the message point toward its destination.</summary>
    public BinRoutingState Release() => To(BinRoutingStatus.Moving, BinRoutingStatus.Routing);

    /// <summary>Reached a sink and left the system.</summary>
    public BinRoutingState Complete() => To(BinRoutingStatus.Completed, BinRoutingStatus.Moving);

    private BinRoutingState To(BinRoutingStatus next, params BinRoutingStatus[] allowedFrom)
    {
        if (Array.IndexOf(allowedFrom, Status) < 0)
        {
            throw new InvalidOperationException($"Illegal bin transition {Status} -> {next}.");
        }

        return new BinRoutingState(next);
    }
}

namespace PlcTelegramSimulator.Domain.Simulation;

/// <summary>
/// Lifecycle of a single bin (transport unit) as it moves along the conveyor and through the
/// MP/TO handshake. Mirrors the state diagram in
/// <c>docs/adr/0012-mp-to-orchestration-and-simulation-authority.md</c>. Physical blocking is
/// emergent: a follower is <see cref="Blocked"/> only because the zone ahead is occupied, never
/// because it "knows" about another bin's transport order.
/// </summary>
public enum BinRoutingStatus
{
    /// <summary>Advancing along the belt toward the next message point or sink.</summary>
    Moving,

    /// <summary>Held because the zone immediately ahead is occupied.</summary>
    Blocked,

    /// <summary>Parked on a message point; the arrival is not yet reported/acknowledged.</summary>
    AtMessagePoint,

    /// <summary>MP telegram sent (Status N) and acknowledged (Status A); waiting for the transport order.</summary>
    AwaitingTransportOrder,

    /// <summary>A destination has been received; the bin is being released toward it.</summary>
    Routing,

    /// <summary>The transport order timed out; awaiting exception handling (default lane / retry).</summary>
    Exception,

    /// <summary>The bin reached a sink and left the system.</summary>
    Completed,
}

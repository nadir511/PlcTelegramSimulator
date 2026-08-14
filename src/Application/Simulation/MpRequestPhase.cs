namespace PlcTelegramSimulator.Application.Simulation;

/// <summary>
/// Two-phase lifecycle of a pending MP request (ADR-0012). A request is created
/// <see cref="PendingAck"/>, becomes <see cref="Acknowledged"/> when the transport receipt
/// (Status A) arrives, and is <see cref="Resolved"/> when its transport order is matched by
/// <c>TelegramId</c>. A missing ACK and a missing TO are distinct faults (see
/// <see cref="MpTimeoutReason"/>).
/// </summary>
public enum MpRequestPhase
{
    /// <summary>Sent to the peer; awaiting the transport acknowledgement (Status A).</summary>
    PendingAck,

    /// <summary>Acknowledged by the peer; awaiting the transport order (next destination).</summary>
    Acknowledged,

    /// <summary>The transport order has been matched and applied.</summary>
    Resolved,
}

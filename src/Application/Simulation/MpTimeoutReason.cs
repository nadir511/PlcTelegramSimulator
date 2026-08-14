namespace PlcTelegramSimulator.Application.Simulation;

/// <summary>Which deadline a pending MP request missed (ADR-0012).</summary>
public enum MpTimeoutReason
{
    /// <summary>No acknowledgement (Status A) arrived within the ACK timeout — a transport fault.</summary>
    Acknowledgement,

    /// <summary>Acknowledged, but no transport order arrived within the TO timeout — a host/decision fault.</summary>
    TransportOrder,
}

namespace PlcTelegramSimulator.Application.Simulation;

/// <summary>
/// Timeout policy for the <see cref="MpOrchestrator"/> (ADR-0012): a missing ACK is a transport
/// fault; a missing TO is a host/decision fault. Defaults are conservative and can be overridden
/// per environment.
/// </summary>
public sealed record MpOrchestratorOptions
{
    /// <summary>How long to wait for the transport acknowledgement (Status A) before faulting.</summary>
    public TimeSpan AcknowledgementTimeout { get; init; } = TimeSpan.FromSeconds(2);

    /// <summary>How long to wait for the transport order after the ACK before faulting.</summary>
    public TimeSpan TransportOrderTimeout { get; init; } = TimeSpan.FromSeconds(10);
}

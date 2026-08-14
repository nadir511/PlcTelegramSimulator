namespace PlcTelegramSimulator.Application.Simulation;

/// <summary>
/// Tuning for the <see cref="SimulationLoop"/> (ADR-0012). The sweep interval controls how often the
/// loop checks the pending-request registry for missed ACK/TO deadlines.
/// </summary>
public sealed record SimulationLoopOptions
{
    /// <summary>How often a <see cref="SimulationInput.SweepTimeouts"/> tick is enqueued.</summary>
    public TimeSpan TimeoutSweepInterval { get; init; } = TimeSpan.FromSeconds(1);
}

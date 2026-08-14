namespace PlcTelegramSimulator.Application.Simulation;

/// <summary>
/// A unit of work drained by the single-writer <see cref="SimulationLoop"/> (ADR-0012). Socket read
/// threads, timers, and UI commands enqueue these; the loop applies them one at a time so
/// concurrent, out-of-order arrivals stay race-free.
/// </summary>
public abstract record SimulationInput
{
    private SimulationInput()
    {
    }

    /// <summary>A bin reached a message point and must be reported to the outer TCP client.</summary>
    public sealed record ReportArrival(string TransportUnitId, string MessagePointId) : SimulationInput;

    /// <summary>A transport acknowledgement (Status A) arrived for a pending request.</summary>
    public sealed record AcknowledgeReceipt(int TelegramId) : SimulationInput;

    /// <summary>A transport order (next destination) arrived for a pending request.</summary>
    public sealed record ResolveTransportOrder(int TelegramId, string Destination) : SimulationInput;

    /// <summary>Periodic tick that sweeps expired ACK/TO deadlines on the loop thread.</summary>
    public sealed record SweepTimeouts : SimulationInput;
}

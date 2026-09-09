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
    /// <param name="TransportUnitId">The bin's transport-unit id.</param>
    /// <param name="MessagePointId">The message point the bin reached.</param>
    /// <param name="TelegramId">
    /// The frontend-minted correlation id encoded into <paramref name="Telegram"/> (ADR-0009), or
    /// <see langword="null"/> to let the backend allocate one (interim path).
    /// </param>
    /// <param name="Telegram">
    /// The finished frontend-encoded telegram to relay verbatim (ADR-0009), or <see langword="null"/>
    /// to fall back to the interim MP string codec.
    /// </param>
    public sealed record ReportArrival(
        string TransportUnitId, string MessagePointId, int? TelegramId, EncodedMpTelegram? Telegram)
        : SimulationInput;

    /// <summary>A transport acknowledgement (Status A) arrived for a pending request.</summary>
    public sealed record AcknowledgeReceipt(int TelegramId) : SimulationInput;

    /// <summary>A transport order (next destination) arrived for a pending request.</summary>
    public sealed record ResolveTransportOrder(int TelegramId, string Destination, string? DestinationMp)
        : SimulationInput;

    /// <summary>Periodic tick that sweeps expired ACK/TO deadlines on the loop thread.</summary>
    public sealed record SweepTimeouts : SimulationInput;
}

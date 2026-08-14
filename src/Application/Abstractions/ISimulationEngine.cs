namespace PlcTelegramSimulator.Application.Abstractions;

/// <summary>
/// Driving port for the single-writer simulation loop (ADR-0012). Callers (the TCP gateway, the
/// REST command handler, timeout timers) never touch simulation state directly: they enqueue inputs
/// through these non-blocking methods, which the loop drains and applies in order. Each method
/// returns <see langword="false"/> when the loop is no longer accepting input (e.g. during shutdown).
/// </summary>
public interface ISimulationEngine
{
    /// <summary>Reports that a bin reached a message point; enqueued for the sim loop.</summary>
    /// <returns><see langword="true"/> if the input was accepted, otherwise <see langword="false"/>.</returns>
    bool TryReportArrival(string transportUnitId, string messagePointId);

    /// <summary>Feeds a transport acknowledgement (Status A) matched by <paramref name="telegramId"/>.</summary>
    /// <returns><see langword="true"/> if the input was accepted, otherwise <see langword="false"/>.</returns>
    bool TryAcknowledge(int telegramId);

    /// <summary>Feeds an inbound transport order (next destination) matched by <paramref name="telegramId"/>.</summary>
    /// <returns><see langword="true"/> if the input was accepted, otherwise <see langword="false"/>.</returns>
    bool TryResolveTransportOrder(int telegramId, string destination);
}

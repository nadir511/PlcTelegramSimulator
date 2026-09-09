using PlcTelegramSimulator.Application.Simulation;

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
    /// <param name="transportUnitId">The bin's transport-unit id.</param>
    /// <param name="messagePointId">The message point the bin reached.</param>
    /// <param name="telegramId">
    /// The frontend-minted correlation id encoded into <paramref name="telegram"/> (ADR-0009), or
    /// <see langword="null"/> to let the backend allocate one (interim path).
    /// </param>
    /// <param name="telegram">
    /// The finished frontend-encoded telegram to relay verbatim (ADR-0009), or <see langword="null"/>
    /// to fall back to the interim MP string codec.
    /// </param>
    /// <returns><see langword="true"/> if the input was accepted, otherwise <see langword="false"/>.</returns>
    bool TryReportArrival(
        string transportUnitId, string messagePointId, int? telegramId, EncodedMpTelegram? telegram);

    /// <summary>Feeds a transport acknowledgement (Status A) matched by <paramref name="telegramId"/>.</summary>
    /// <returns><see langword="true"/> if the input was accepted, otherwise <see langword="false"/>.</returns>
    bool TryAcknowledge(int telegramId);

    /// <summary>Feeds an inbound transport order (next destination) matched by <paramref name="telegramId"/>.</summary>
    /// <param name="telegramId">Correlation key of the originating MP request.</param>
    /// <param name="destination">The next destination the bin should route toward.</param>
    /// <param name="destinationMp">The next message point id, when supplied (ADR-0015); otherwise <see langword="null"/>.</param>
    /// <returns><see langword="true"/> if the input was accepted, otherwise <see langword="false"/>.</returns>
    bool TryResolveTransportOrder(int telegramId, string destination, string? destinationMp);
}

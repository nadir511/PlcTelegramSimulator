using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Application.Messaging;

namespace PlcTelegramSimulator.Application.Simulation;

/// <summary>
/// Reports that a bin reached a message point (ADR-0012). Enqueues the arrival onto the single-writer
/// <see cref="ISimulationEngine"/> and returns whether it was accepted; the MP telegram is sent and
/// the TO awaited asynchronously by the loop.
/// </summary>
/// <param name="TransportUnitId">The bin's transport-unit id.</param>
/// <param name="MessagePointId">The message point the bin reached.</param>
/// <param name="TelegramId">
/// The frontend-minted correlation id encoded into <paramref name="Telegram"/> (ADR-0009), or
/// <see langword="null"/> to let the backend allocate one (interim path).
/// </param>
/// <param name="Telegram">
/// The finished frontend-encoded telegram to relay verbatim (ADR-0009), or <see langword="null"/> to
/// fall back to the interim MP string codec.
/// </param>
public sealed record ReportArrivalCommand(
    string TransportUnitId,
    string MessagePointId,
    int? TelegramId = null,
    EncodedMpTelegram? Telegram = null)
    : IRequest<ArrivalAccepted>;

/// <summary>The outcome of enqueuing a <see cref="ReportArrivalCommand"/>.</summary>
/// <param name="Accepted">Whether the simulation loop accepted the arrival.</param>
public sealed record ArrivalAccepted(bool Accepted);

internal sealed class ReportArrivalCommandHandler(ISimulationEngine engine)
    : IRequestHandler<ReportArrivalCommand, ArrivalAccepted>
{
    public Task<ArrivalAccepted> Handle(ReportArrivalCommand request, CancellationToken cancellationToken)
    {
        var accepted = engine.TryReportArrival(
            request.TransportUnitId, request.MessagePointId, request.TelegramId, request.Telegram);
        return Task.FromResult(new ArrivalAccepted(accepted));
    }
}

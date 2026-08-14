namespace PlcTelegramSimulator.Application.Simulation;

/// <summary>
/// The resolved transport order for a bin: the next <see cref="Destination"/> the outer TCP client
/// returned for a message-point report, matched to its request by <see cref="TelegramId"/>
/// (ADR-0012).
/// </summary>
/// <param name="TelegramId">The correlation key of the originating MP request.</param>
/// <param name="TransportUnitId">The bin the destination applies to.</param>
/// <param name="MessagePointId">The message point that reported the arrival.</param>
/// <param name="Destination">The next destination the bin should route toward.</param>
public sealed record TransportOrder(
    int TelegramId,
    string TransportUnitId,
    string MessagePointId,
    string Destination);

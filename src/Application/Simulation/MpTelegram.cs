namespace PlcTelegramSimulator.Application.Simulation;

/// <summary>
/// The outbound MP report for a bin that reached a message point. Sent to the outer TCP client with
/// header <c>Status = N</c> ("new") and correlated back to its transport order by
/// <see cref="TelegramId"/> (ADR-0012).
/// </summary>
/// <param name="TelegramId">Correlation key; unique per outstanding request (frontend-minted, ADR-0009).</param>
/// <param name="TransportUnitId">The bin's TU id (part of the telegram).</param>
/// <param name="MessagePointId">The reporting message point (the sensor's MP id).</param>
/// <param name="Encoded">
/// The finished frontend-encoded telegram to relay verbatim (the id is already encoded in, ADR-0009),
/// or <see langword="null"/> to fall back to the interim string codec.
/// </param>
public sealed record MpTelegram(
    int TelegramId,
    string TransportUnitId,
    string MessagePointId,
    EncodedMpTelegram? Encoded = null);

namespace PlcTelegramSimulator.Application.Simulation;

/// <summary>
/// The outbound MP report for a bin that reached a message point. Sent to the outer TCP client with
/// header <c>Status = N</c> ("new") and correlated back to its transport order by
/// <see cref="TelegramId"/> (ADR-0012).
/// </summary>
/// <param name="TelegramId">Correlation key; unique per outstanding request.</param>
/// <param name="TransportUnitId">The bin's TU id (part of the telegram).</param>
/// <param name="MessagePointId">The reporting message point (the sensor's MP id).</param>
public sealed record MpTelegram(int TelegramId, string TransportUnitId, string MessagePointId);

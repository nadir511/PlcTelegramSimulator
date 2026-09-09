namespace PlcTelegramSimulator.Web.Contracts;

/// <summary>
/// Request body for <c>POST /api/simulation/arrivals</c>: a bin reached a message point and must be
/// reported to the outer TCP client (ADR-0012).
/// </summary>
public sealed record ArrivalRequest
{
    /// <summary>The bin's transport-unit id.</summary>
    public string TransportUnitId { get; init; } = string.Empty;

    /// <summary>The message point the bin reached.</summary>
    public string MessagePointId { get; init; } = string.Empty;

    /// <summary>
    /// The frontend-minted correlation id encoded into <see cref="Telegram"/> (ADR-0009). Required
    /// whenever <see cref="Telegram"/> is supplied (the backend correlates the round-trip by this id);
    /// optional otherwise, in which case the backend allocates one for the interim string codec.
    /// </summary>
    public int? TelegramId { get; init; }

    /// <summary>
    /// The finished frontend-encoded telegram bytes (each 0..255) to relay verbatim (ADR-0009); the
    /// correlation id is already encoded in. Optional: when omitted the backend falls back to the
    /// interim MP string codec.
    /// </summary>
    public IReadOnlyList<int>? Telegram { get; init; }
}

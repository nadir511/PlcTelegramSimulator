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
}

namespace PlcTelegramSimulator.Web.Contracts;

/// <summary>
/// Wire DTO for the <c>mpReported</c> hub message: a bin reached a message point and its MP telegram
/// (Status N) was sent, so the bin now awaits a transport order (ADR-0012).
/// </summary>
public sealed record MpReportedDto
{
    /// <summary>Correlation key of the MP request.</summary>
    public required int TelegramId { get; init; }

    /// <summary>The bin's transport-unit id.</summary>
    public required string TransportUnitId { get; init; }

    /// <summary>The message point that reported the arrival.</summary>
    public required string MessagePointId { get; init; }
}

/// <summary>
/// Wire DTO for the <c>transportOrder</c> hub message: a resolved next destination for a bin,
/// matched to its MP request by <see cref="TelegramId"/> (ADR-0012).
/// </summary>
public sealed record TransportOrderDto
{
    /// <summary>Correlation key of the originating MP request.</summary>
    public required int TelegramId { get; init; }

    /// <summary>The bin the destination applies to.</summary>
    public required string TransportUnitId { get; init; }

    /// <summary>The message point that reported the arrival.</summary>
    public required string MessagePointId { get; init; }

    /// <summary>The next destination the bin should route toward.</summary>
    public required string Destination { get; init; }

    /// <summary>
    /// The next message point id the bin should route toward, when the transport order supplies one
    /// (ADR-0015). Optional and additive to <see cref="Destination"/>; <see langword="null"/> when the
    /// order carries only a generic destination.
    /// </summary>
    public string? DestinationMp { get; init; }
}

/// <summary>
/// Wire DTO for the <c>fault</c> hub message: a pending MP request timed out awaiting its ACK or TO
/// (ADR-0012). <see cref="Reason"/> is a lowercase token (<c>ack|to</c>).
/// </summary>
public sealed record SimulationFaultDto
{
    /// <summary>Correlation key of the faulted request.</summary>
    public required int TelegramId { get; init; }

    /// <summary>The bin whose request faulted.</summary>
    public required string TransportUnitId { get; init; }

    /// <summary>The message point that reported the arrival.</summary>
    public required string MessagePointId { get; init; }

    /// <summary>Which deadline was missed: <c>ack</c> (transport) or <c>to</c> (host/decision).</summary>
    public required string Reason { get; init; }
}

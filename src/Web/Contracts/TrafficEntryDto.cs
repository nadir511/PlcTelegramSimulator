namespace PlcTelegramSimulator.Web.Contracts;

/// <summary>
/// A single live-traffic row pushed over the hub as <c>traffic</c>.
/// </summary>
/// <remarks>
/// <see cref="Payload"/> is typed as <see cref="IReadOnlyList{Int32}"/> (not
/// <c>byte[]</c>) so it serializes as a JSON array of numbers rather than a
/// base64 string. <see cref="Payload"/>/<see cref="Message"/>/<see cref="Label"/>
/// are omitted when null via the global "ignore when null" policy.
/// </remarks>
public sealed record TrafficEntryDto
{
    /// <summary>Unique, monotonically increasing id (e.g. <c>evt-42</c>).</summary>
    public required string Id { get; init; }

    /// <summary>Epoch milliseconds (UTC).</summary>
    public required long Timestamp { get; init; }

    /// <summary>Lowercase level token (<c>out|in|error|system</c>).</summary>
    public required string Level { get; init; }

    /// <summary>Raw telegram bytes for <c>out</c>/<c>in</c> rows; omitted otherwise.</summary>
    public IReadOnlyList<int>? Payload { get; init; }

    /// <summary>Free-text content for <c>error</c>/<c>system</c> rows; omitted otherwise.</summary>
    public string? Message { get; init; }

    /// <summary>Optional decoded label (e.g. <c>ACK</c>); omitted when absent.</summary>
    public string? Label { get; init; }
}

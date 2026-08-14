using System.Text.Json.Serialization;

namespace PlcTelegramSimulator.Web.Contracts;

/// <summary>
/// Listener status snapshot returned by the REST API and pushed over the hub as
/// <c>status</c>. <see cref="Status"/> is a lowercase token
/// (<c>stopped|starting|listening|connected|error</c>).
/// </summary>
public sealed record ConnectionStatusDto
{
    /// <summary>Lowercase status token.</summary>
    public required string Status { get; init; }

    /// <summary>
    /// Error text when <see cref="Status"/> is <c>error</c>, otherwise <c>null</c>.
    /// Always serialized (even when null) so the client can clear stale errors,
    /// overriding the global "ignore when null" policy.
    /// </summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public string? Error { get; init; }
}

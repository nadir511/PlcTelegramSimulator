namespace PlcTelegramSimulator.Web.Contracts;

/// <summary>
/// Request body for <c>POST /api/connection/send</c>. Carries the raw telegram
/// bytes as a JSON array of numbers (each expected in the 0..255 range).
/// </summary>
public sealed record SendTelegramRequest
{
    /// <summary>Raw telegram byte values (0..255).</summary>
    public IReadOnlyList<int> Payload { get; init; } = [];
}

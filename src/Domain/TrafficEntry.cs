using System.Threading;

namespace PlcTelegramSimulator.Domain;

/// <summary>
/// An immutable row in the live-traffic log. Telegram rows (<see cref="TrafficLevel.Outbound"/>
/// / <see cref="TrafficLevel.Inbound"/>) carry a raw <see cref="Payload"/>; informational rows
/// (<see cref="TrafficLevel.Error"/> / <see cref="TrafficLevel.System"/>) carry a
/// <see cref="Message"/>. Instances are created through the static factory helpers so every
/// entry receives a unique, monotonically increasing <see cref="Id"/> and a UTC timestamp.
/// </summary>
public sealed record TrafficEntry(
    string Id,
    DateTimeOffset Timestamp,
    TrafficLevel Level,
    IReadOnlyList<byte>? Payload,
    string? Message,
    string? Label)
{
    private static long _sequence;

    /// <summary>Creates an outbound telegram entry with an optional decoded <paramref name="label"/>.</summary>
    public static TrafficEntry Outbound(IReadOnlyList<byte> payload, string? label = null) =>
        new(NextId(), DateTimeOffset.UtcNow, TrafficLevel.Outbound, payload, Message: null, label);

    /// <summary>Creates an inbound telegram entry with an optional decoded <paramref name="label"/>.</summary>
    public static TrafficEntry Inbound(IReadOnlyList<byte> payload, string? label = null) =>
        new(NextId(), DateTimeOffset.UtcNow, TrafficLevel.Inbound, payload, Message: null, label);

    /// <summary>Creates an error entry carrying a free-text <paramref name="message"/>.</summary>
    public static TrafficEntry Error(string message) =>
        new(NextId(), DateTimeOffset.UtcNow, TrafficLevel.Error, Payload: null, message, Label: null);

    /// <summary>Creates a system/lifecycle entry carrying a free-text <paramref name="message"/>.</summary>
    public static TrafficEntry System(string message) =>
        new(NextId(), DateTimeOffset.UtcNow, TrafficLevel.System, Payload: null, message, Label: null);

    private static string NextId() => $"evt-{Interlocked.Increment(ref _sequence)}";
}

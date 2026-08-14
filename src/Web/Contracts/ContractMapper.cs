using PlcTelegramSimulator.Application.Connection;
using PlcTelegramSimulator.Domain;

namespace PlcTelegramSimulator.Web.Contracts;

/// <summary>
/// Maps domain/application types to wire DTOs. Enum-to-token mapping is explicit
/// (never relying on default enum serialization) so the exact lowercase literals
/// the frontend expects are guaranteed.
/// </summary>
public static class ContractMapper
{
    /// <summary>Maps a <see cref="ConnectionSnapshot"/> to its wire DTO.</summary>
    public static ConnectionStatusDto ToDto(ConnectionSnapshot snapshot) =>
        new() { Status = ToToken(snapshot.Status), Error = snapshot.Error };

    /// <summary>Maps a status/error pair to its wire DTO.</summary>
    public static ConnectionStatusDto ToDto(ListenerStatus status, string? error) =>
        new() { Status = ToToken(status), Error = error };

    /// <summary>Maps a <see cref="TrafficEntry"/> to its wire DTO.</summary>
    public static TrafficEntryDto ToDto(TrafficEntry entry) =>
        new()
        {
            Id = entry.Id,
            Timestamp = entry.Timestamp.ToUnixTimeMilliseconds(),
            Level = ToToken(entry.Level),
            Payload = ToPayload(entry.Payload),
            Message = entry.Message,
            Label = entry.Label,
        };

    /// <summary>Maps a listener status to its lowercase wire token.</summary>
    public static string ToToken(ListenerStatus status) => status switch
    {
        ListenerStatus.Stopped => "stopped",
        ListenerStatus.Starting => "starting",
        ListenerStatus.Listening => "listening",
        ListenerStatus.Connected => "connected",
        ListenerStatus.Error => "error",
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, "Unknown listener status."),
    };

    /// <summary>Maps a traffic level to its lowercase wire token.</summary>
    public static string ToToken(TrafficLevel level) => level switch
    {
        TrafficLevel.Outbound => "out",
        TrafficLevel.Inbound => "in",
        TrafficLevel.Error => "error",
        TrafficLevel.System => "system",
        _ => throw new ArgumentOutOfRangeException(nameof(level), level, "Unknown traffic level."),
    };

    private static IReadOnlyList<int>? ToPayload(IReadOnlyList<byte>? payload)
    {
        if (payload is null)
        {
            return null;
        }

        var values = new int[payload.Count];
        for (var i = 0; i < payload.Count; i++)
        {
            values[i] = payload[i];
        }

        return values;
    }
}

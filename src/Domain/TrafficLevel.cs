namespace PlcTelegramSimulator.Domain;

/// <summary>
/// Category of a live-traffic log entry. Serialized to the lowercase wire
/// tokens <c>out|in|error|system</c> by the Web layer.
/// </summary>
public enum TrafficLevel
{
    /// <summary>A telegram sent by the simulator to a peer (<c>out</c>).</summary>
    Outbound,

    /// <summary>A telegram received by the simulator from a peer (<c>in</c>).</summary>
    Inbound,

    /// <summary>A framing/transport error surfaced to the log (<c>error</c>).</summary>
    Error,

    /// <summary>An informational lifecycle message (<c>system</c>).</summary>
    System,
}

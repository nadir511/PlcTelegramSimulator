namespace PlcTelegramSimulator.Web.Contracts;

/// <summary>
/// Request body for <c>POST /api/connection/start</c>. Mirrors the frontend
/// <c>ListenerConfig</c> shape (camelCase JSON). Validated in the domain via
/// <see cref="Domain.ListenerConfig.Create"/>.
/// </summary>
public sealed record ListenerConfigRequest
{
    /// <summary>Local interface to bind (e.g. <c>0.0.0.0</c>). Used in server mode.</summary>
    public string BindAddress { get; init; } = string.Empty;

    /// <summary>TCP port the simulator sends outbound telegrams on.</summary>
    public int SendPort { get; init; }

    /// <summary>TCP port the simulator receives inbound telegrams on.</summary>
    public int ReceivePort { get; init; }

    /// <summary>Simulated controller latency in milliseconds before an ACK is sent.</summary>
    public int ProcessingDelayMs { get; init; }

    /// <summary>Keep the listener open and accept a new client after one disconnects.</summary>
    public bool AutoAcceptReconnections { get; init; }

    /// <summary>
    /// End-of-Telegram terminator (from the telegram type registry) the transport appends to
    /// every outbound telegram and splits inbound frames on. Defaults to <c>~</c> (eHub's
    /// terminator) to mirror the frontend default; the client sends the registry value on connect.
    /// </summary>
    public string EndOfTelegram { get; init; } = "~";
}

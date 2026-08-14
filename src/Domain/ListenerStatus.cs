namespace PlcTelegramSimulator.Domain;

/// <summary>
/// Lifecycle states of the simulated PLC's TCP listener. Serialized to the
/// lowercase wire tokens <c>stopped|starting|listening|connected|error</c> by
/// the Web layer.
/// </summary>
public enum ListenerStatus
{
    /// <summary>No listener is bound; the simulator is idle.</summary>
    Stopped,

    /// <summary>The listener is in the process of binding its sockets.</summary>
    Starting,

    /// <summary>Sockets are bound and awaiting a client connection.</summary>
    Listening,

    /// <summary>At least one client is connected on the send or receive port.</summary>
    Connected,

    /// <summary>The listener failed to start or encountered a fatal error.</summary>
    Error,
}

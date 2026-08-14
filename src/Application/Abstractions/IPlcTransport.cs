using PlcTelegramSimulator.Domain;

namespace PlcTelegramSimulator.Application.Abstractions;

/// <summary>
/// Port for the simulated PLC transport. Implemented by the Infrastructure TCP
/// adapter. The Application layer drives the listener through the async methods
/// and observes lifecycle/traffic through the events (Observer pattern).
/// </summary>
public interface IPlcTransport
{
    /// <summary>Binds the listener and begins accepting clients.</summary>
    Task StartAsync(ListenerConfig config, CancellationToken cancellationToken);

    /// <summary>Stops the listener, closing clients and sockets. No-op when stopped.</summary>
    Task StopAsync(CancellationToken cancellationToken);

    /// <summary>Sends a manual outbound telegram to the connected peer, if any.</summary>
    Task SendAsync(IReadOnlyList<byte> payload, CancellationToken cancellationToken);

    /// <summary>Raised whenever the listener lifecycle status changes.</summary>
    event Action<ListenerStatus, string?> StatusChanged;

    /// <summary>Raised for every observed traffic entry (inbound/outbound/system/error).</summary>
    event Action<TrafficEntry> TrafficObserved;

    /// <summary>
    /// Raised for every decoded inbound telegram frame (raw payload, framing removed). The MP/TO
    /// gateway subscribes to feed acknowledgements and transport orders back to the simulation
    /// engine (ADR-0012), keeping correlation logic free of sockets.
    /// </summary>
    event Action<IReadOnlyList<byte>> TelegramReceived;
}

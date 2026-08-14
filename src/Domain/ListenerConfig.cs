using System.Net;

namespace PlcTelegramSimulator.Domain;

/// <summary>
/// Validated configuration for the simulated PLC's TCP listener. This is a value
/// object: it can only be constructed through <see cref="Create"/>, which enforces
/// the invariants below and throws <see cref="DomainValidationException"/> otherwise.
/// </summary>
public sealed class ListenerConfig
{
    /// <summary>Upper bound for <see cref="ProcessingDelay"/> in milliseconds.</summary>
    public const int MaxProcessingDelayMs = 60_000;

    private ListenerConfig(
        string bindAddress,
        int sendPort,
        int receivePort,
        TimeSpan processingDelay,
        bool autoAcceptReconnections)
    {
        BindAddress = bindAddress;
        SendPort = sendPort;
        ReceivePort = receivePort;
        ProcessingDelay = processingDelay;
        AutoAcceptReconnections = autoAcceptReconnections;
    }

    /// <summary>Local interface to bind (e.g. <c>0.0.0.0</c> for all interfaces).</summary>
    public string BindAddress { get; }

    /// <summary>TCP port the simulator sends outbound telegrams on.</summary>
    public int SendPort { get; }

    /// <summary>TCP port the simulator receives inbound telegrams on.</summary>
    public int ReceivePort { get; }

    /// <summary>Simulated controller latency before an inbound telegram is acknowledged.</summary>
    public TimeSpan ProcessingDelay { get; }

    /// <summary>Keep the listener open and accept a new client after one disconnects.</summary>
    public bool AutoAcceptReconnections { get; }

    /// <summary>
    /// Validates the supplied values and builds a <see cref="ListenerConfig"/>.
    /// </summary>
    /// <exception cref="DomainValidationException">
    /// Thrown when any field is invalid. The exception carries a field → message map.
    /// </exception>
    public static ListenerConfig Create(
        string bindAddress,
        int sendPort,
        int receivePort,
        int processingDelayMs,
        bool autoAcceptReconnections)
    {
        var errors = new Dictionary<string, string>();

        if (string.IsNullOrWhiteSpace(bindAddress))
        {
            errors["bindAddress"] = "Bind address is required.";
        }
        else if (!IPAddress.TryParse(bindAddress, out _))
        {
            errors["bindAddress"] = "Bind address must be a valid IP address.";
        }

        if (sendPort is < 1 or > 65535)
        {
            errors["sendPort"] = "Send port must be between 1 and 65535.";
        }

        if (receivePort is < 1 or > 65535)
        {
            errors["receivePort"] = "Receive port must be between 1 and 65535.";
        }

        // Only meaningful once both ports are individually valid; avoids masking
        // a range error with the equality message.
        if (!errors.ContainsKey("sendPort") && !errors.ContainsKey("receivePort") && sendPort == receivePort)
        {
            errors["receivePort"] = "Send and receive ports must be different.";
        }

        if (processingDelayMs is < 0 or > MaxProcessingDelayMs)
        {
            errors["processingDelayMs"] = $"Processing delay must be between 0 and {MaxProcessingDelayMs} ms.";
        }

        if (errors.Count > 0)
        {
            throw new DomainValidationException(errors);
        }

        return new ListenerConfig(
            bindAddress,
            sendPort,
            receivePort,
            TimeSpan.FromMilliseconds(processingDelayMs),
            autoAcceptReconnections);
    }
}

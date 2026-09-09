using System.Net;
using System.Text;

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

    /// <summary>Maximum number of characters allowed in the End-of-Telegram terminator.</summary>
    public const int MaxEndOfTelegramLength = 8;

    private ListenerConfig(
        string bindAddress,
        int sendPort,
        int receivePort,
        TimeSpan processingDelay,
        bool autoAcceptReconnections,
        string endOfTelegram,
        byte[] terminator)
    {
        BindAddress = bindAddress;
        SendPort = sendPort;
        ReceivePort = receivePort;
        ProcessingDelay = processingDelay;
        AutoAcceptReconnections = autoAcceptReconnections;
        EndOfTelegram = endOfTelegram;
        Terminator = terminator;
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
    /// The End-of-Telegram terminator string (e.g. <c>#</c> or <c>~</c>) as configured in
    /// the telegram type registry. The transport appends its <see cref="Terminator"/> bytes
    /// to every outbound telegram and splits inbound frames on it (ADR-0018).
    /// </summary>
    public string EndOfTelegram { get; }

    /// <summary>The Latin-1 bytes of <see cref="EndOfTelegram"/> used to frame telegrams.</summary>
    public IReadOnlyList<byte> Terminator { get; }

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
        bool autoAcceptReconnections,
        string endOfTelegram = "~")
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

        var terminator = ValidateEndOfTelegram(endOfTelegram, errors);

        if (errors.Count > 0)
        {
            throw new DomainValidationException(errors);
        }

        return new ListenerConfig(
            bindAddress,
            sendPort,
            receivePort,
            TimeSpan.FromMilliseconds(processingDelayMs),
            autoAcceptReconnections,
            endOfTelegram,
            terminator);
    }

    /// <summary>
    /// Validates the End-of-Telegram terminator and returns its Latin-1 bytes. A delimiter is
    /// required to frame telegrams on the wire in both directions, so an empty terminator is
    /// rejected; every character must be a single Latin-1 byte (0..255) since the wire is byte
    /// oriented. Adds a keyed <c>endOfTelegram</c> error instead of throwing so callers can
    /// aggregate it with the other field errors.
    /// </summary>
    private static byte[] ValidateEndOfTelegram(string endOfTelegram, IDictionary<string, string> errors)
    {
        if (string.IsNullOrEmpty(endOfTelegram))
        {
            errors["endOfTelegram"] = "End of Telegram terminator is required.";
            return [];
        }

        if (endOfTelegram.Length > MaxEndOfTelegramLength)
        {
            errors["endOfTelegram"] = $"End of Telegram must be at most {MaxEndOfTelegramLength} characters.";
            return [];
        }

        foreach (var ch in endOfTelegram)
        {
            if (ch > 0xFF)
            {
                errors["endOfTelegram"] = "End of Telegram must contain only single-byte (Latin-1) characters.";
                return [];
            }
        }

        return Encoding.Latin1.GetBytes(endOfTelegram);
    }
}

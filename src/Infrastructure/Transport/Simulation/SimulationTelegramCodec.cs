using System.Globalization;
using System.Text;
using PlcTelegramSimulator.Application.Simulation;

namespace PlcTelegramSimulator.Infrastructure.Transport.Simulation;

/// <summary>
/// Interim ASCII wire codec for the simulator's MP/TO exchange (ADR-0012), realizing the deferred
/// "concrete wire mapping" follow-up. Messages are pipe-delimited ASCII carrying the existing
/// <c>TelegramId</c> and <c>Status</c> (N/A) fields; the <see cref="Framing.EofTelegramFramer"/> adds
/// the trailing <c>~</c>. There is no escaping — MP/TO ids and destinations must not contain <c>|</c>.
/// <list type="bullet">
///   <item><description>Outbound MP report: <c>MP|{telegramId}|{tu}|{mp}|N</c>.</description></item>
///   <item><description>Inbound acknowledgement: <c>ACK|{telegramId}|A</c>.</description></item>
///   <item><description>Inbound transport order: <c>TO|{telegramId}|{destination}</c>.</description></item>
/// </list>
/// This is a simulator convenience format, not a committed protocol; a richer telegram schema can
/// replace it behind the same gateway without touching the orchestrator.
/// </summary>
public static class SimulationTelegramCodec
{
    private const char Separator = '|';

    /// <summary>Encodes an outbound MP report (Status N) as its pipe-delimited ASCII payload.</summary>
    public static byte[] EncodeMp(MpTelegram telegram)
    {
        ArgumentNullException.ThrowIfNull(telegram);

        var text = string.Create(
            CultureInfo.InvariantCulture,
            $"MP{Separator}{telegram.TelegramId}{Separator}{telegram.TransportUnitId}{Separator}{telegram.MessagePointId}{Separator}N");

        return Encoding.ASCII.GetBytes(text);
    }

    /// <summary>
    /// Attempts to parse an inbound frame as an acknowledgement or transport order. Returns
    /// <see langword="false"/> (and a default <paramref name="result"/>) for anything else — the raw
    /// ACK sentinel, manual sends, or malformed input — which the gateway ignores.
    /// </summary>
    public static bool TryParseInbound(IReadOnlyList<byte> payload, out InboundSimTelegram result)
    {
        result = default;

        if (payload is null || payload.Count == 0)
        {
            return false;
        }

        var bytes = payload as byte[] ?? [.. payload];
        var text = Encoding.ASCII.GetString(bytes);
        var parts = text.Split(Separator);

        if (parts.Length != 3)
        {
            return false;
        }

        if (!int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var telegramId))
        {
            return false;
        }

        switch (parts[0])
        {
            case "ACK" when parts[2] == "A":
                result = InboundSimTelegram.Ack(telegramId);
                return true;
            case "TO" when !string.IsNullOrWhiteSpace(parts[2]):
                result = InboundSimTelegram.TransportOrder(telegramId, parts[2]);
                return true;
            default:
                return false;
        }
    }
}

/// <summary>Which kind of inbound MP/TO message was decoded.</summary>
public enum InboundSimKind
{
    /// <summary>A transport acknowledgement (Status A) for a pending request.</summary>
    Acknowledgement,

    /// <summary>A transport order carrying the bin's next destination.</summary>
    TransportOrder,
}

/// <summary>A decoded inbound MP/TO message (ADR-0012).</summary>
/// <param name="Kind">Whether this is an acknowledgement or a transport order.</param>
/// <param name="TelegramId">The correlation key matching the originating MP request.</param>
/// <param name="Destination">The next destination (transport orders only; empty for an ACK).</param>
public readonly record struct InboundSimTelegram(InboundSimKind Kind, int TelegramId, string Destination)
{
    /// <summary>Creates an acknowledgement result.</summary>
    public static InboundSimTelegram Ack(int telegramId) =>
        new(InboundSimKind.Acknowledgement, telegramId, string.Empty);

    /// <summary>Creates a transport-order result.</summary>
    public static InboundSimTelegram TransportOrder(int telegramId, string destination) =>
        new(InboundSimKind.TransportOrder, telegramId, destination);
}

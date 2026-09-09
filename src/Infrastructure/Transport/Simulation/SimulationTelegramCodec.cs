using System.Globalization;
using System.Text;
using PlcTelegramSimulator.Application.Simulation;

namespace PlcTelegramSimulator.Infrastructure.Transport.Simulation;

/// <summary>
/// Interim ASCII wire codec for the simulator's MP/TO exchange (ADR-0012), realizing the deferred
/// "concrete wire mapping" follow-up. Messages are pipe-delimited ASCII carrying the existing
/// <c>TelegramId</c> and <c>Status</c> (N/A) fields; the transport frames the result with the
/// session's configured End-of-Telegram terminator (ADR-0018). There is no escaping — MP/TO ids
/// and destinations must not contain <c>|</c>.
/// <list type="bullet">
///   <item><description>Outbound MP report: <c>MP|{telegramId:D6}|{tu}|{mp}|N</c> (id zero-padded, ADR-0015).</description></item>
///   <item><description>Inbound acknowledgement: <c>ACK|{telegramId}|A</c>.</description></item>
///   <item><description>Inbound transport order: <c>TO|{telegramId}|{destination}</c>, or with an
///   explicit next message point <c>TO|{telegramId}|{destination}|{destinationMp}</c> (ADR-0015).</description></item>
/// </list>
/// This is a simulator convenience format, not a committed protocol; a richer telegram schema can
/// replace it behind the same gateway without touching the orchestrator.
/// </summary>
public static class SimulationTelegramCodec
{
    private const char Separator = '|';

    /// <summary>
    /// Encodes an outbound MP report (Status N) as its pipe-delimited ASCII payload, zero-padding the
    /// <c>TelegramId</c> to <paramref name="telegramIdWidth"/> digits (ADR-0015). Padding is cosmetic
    /// on the wire only — the id stays an <see cref="int"/> everywhere and <c>int.TryParse</c>
    /// round-trips it. A width of zero or less emits the plain number.
    /// </summary>
    public static byte[] EncodeMp(MpTelegram telegram, int telegramIdWidth = 6)
    {
        ArgumentNullException.ThrowIfNull(telegram);

        var id = telegramIdWidth > 0
            ? telegram.TelegramId.ToString($"D{telegramIdWidth}", CultureInfo.InvariantCulture)
            : telegram.TelegramId.ToString(CultureInfo.InvariantCulture);

        var text = string.Create(
            CultureInfo.InvariantCulture,
            $"MP{Separator}{id}{Separator}{telegram.TransportUnitId}{Separator}{telegram.MessagePointId}{Separator}N");

        return Encoding.ASCII.GetBytes(text);
    }

    /// <summary>
    /// Returns the finished frontend-authored MP telegram (ADR-0009) as its wire bytes. The frontend
    /// has already encoded every field — including the correlation <c>TelegramId</c> — so the backend
    /// relays the payload verbatim; a defensive copy is returned so the caller can frame it (ADR-0018)
    /// without any shared-array surprises. There is no id stamping: the id travels in the bytes the
    /// frontend produced.
    /// </summary>
    public static byte[] EncodeMpPayload(EncodedMpTelegram encoded)
    {
        ArgumentNullException.ThrowIfNull(encoded);

        return [.. encoded.Payload];
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

        if (parts.Length is not (3 or 4))
        {
            return false;
        }

        if (!int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var telegramId))
        {
            return false;
        }

        // A four-part frame is an enriched transport order carrying an explicit next message point
        // (ADR-0015): TO|{id}|{dest}|{destMp}. Only TO is valid with four parts; the destination must
        // be present, while an empty next-MP is treated as "not supplied" (null).
        if (parts.Length == 4)
        {
            if (parts[0] != "TO" || string.IsNullOrWhiteSpace(parts[2]))
            {
                return false;
            }

            var destinationMp = string.IsNullOrWhiteSpace(parts[3]) ? null : parts[3];
            result = InboundSimTelegram.TransportOrder(telegramId, parts[2], destinationMp);
            return true;
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

/// <summary>A decoded inbound MP/TO message (ADR-0012, ADR-0015).</summary>
/// <param name="Kind">Whether this is an acknowledgement or a transport order.</param>
/// <param name="TelegramId">The correlation key matching the originating MP request.</param>
/// <param name="Destination">The next destination (transport orders only; empty for an ACK).</param>
/// <param name="DestinationMp">
/// The next message point id when the transport order supplies one (four-part <c>TO</c> frame,
/// ADR-0015); <see langword="null"/> for a three-part order or an acknowledgement.
/// </param>
public readonly record struct InboundSimTelegram(
    InboundSimKind Kind, int TelegramId, string Destination, string? DestinationMp)
{
    /// <summary>Creates an acknowledgement result.</summary>
    public static InboundSimTelegram Ack(int telegramId) =>
        new(InboundSimKind.Acknowledgement, telegramId, string.Empty, DestinationMp: null);

    /// <summary>Creates a transport-order result with no explicit next message point.</summary>
    public static InboundSimTelegram TransportOrder(int telegramId, string destination) =>
        new(InboundSimKind.TransportOrder, telegramId, destination, DestinationMp: null);

    /// <summary>Creates a transport-order result carrying an optional next message point.</summary>
    public static InboundSimTelegram TransportOrder(int telegramId, string destination, string? destinationMp) =>
        new(InboundSimKind.TransportOrder, telegramId, destination, destinationMp);
}

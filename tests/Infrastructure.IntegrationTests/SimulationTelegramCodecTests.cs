using System.Text;
using PlcTelegramSimulator.Application.Simulation;
using PlcTelegramSimulator.Infrastructure.Transport.Simulation;

namespace PlcTelegramSimulator.Infrastructure.IntegrationTests;

public sealed class SimulationTelegramCodecTests
{
    [Fact]
    public void EncodeMp_ProducesPipeDelimitedStatusN_WithZeroPaddedId()
    {
        var telegram = new MpTelegram(1, "TU-1", "MP3");

        var text = Encoding.ASCII.GetString(SimulationTelegramCodec.EncodeMp(telegram));

        Assert.Equal("MP|000001|TU-1|MP3|N", text);
    }

    [Fact]
    public void EncodeMp_PadsIdToRequestedWidth()
    {
        var telegram = new MpTelegram(42, "TU-1", "MP3");

        var text = Encoding.ASCII.GetString(SimulationTelegramCodec.EncodeMp(telegram));

        Assert.Equal("MP|000042|TU-1|MP3|N", text);
    }

    [Fact]
    public void EncodeMp_WidthZeroOrLess_EmitsPlainNumber()
    {
        var telegram = new MpTelegram(7, "TU-1", "MP3");

        var text = Encoding.ASCII.GetString(SimulationTelegramCodec.EncodeMp(telegram, telegramIdWidth: 0));

        Assert.Equal("MP|7|TU-1|MP3|N", text);
    }

    [Fact]
    public void TryParseInbound_Acknowledgement_ParsesTelegramId()
    {
        var parsed = SimulationTelegramCodec.TryParseInbound(Ascii("ACK|42|A"), out var inbound);

        Assert.True(parsed);
        Assert.Equal(InboundSimKind.Acknowledgement, inbound.Kind);
        Assert.Equal(42, inbound.TelegramId);
    }

    [Fact]
    public void TryParseInbound_PaddedAckId_RoundTripsToInt()
    {
        var parsed = SimulationTelegramCodec.TryParseInbound(Ascii("ACK|000001|A"), out var inbound);

        Assert.True(parsed);
        Assert.Equal(1, inbound.TelegramId);
    }

    [Fact]
    public void TryParseInbound_TransportOrder_ParsesIdAndDestination()
    {
        var parsed = SimulationTelegramCodec.TryParseInbound(Ascii("TO|42|DEST-Z"), out var inbound);

        Assert.True(parsed);
        Assert.Equal(InboundSimKind.TransportOrder, inbound.Kind);
        Assert.Equal(42, inbound.TelegramId);
        Assert.Equal("DEST-Z", inbound.Destination);
        Assert.Null(inbound.DestinationMp);
    }

    [Fact]
    public void TryParseInbound_FourPartTransportOrder_ParsesDestinationAndNextMp()
    {
        var parsed = SimulationTelegramCodec.TryParseInbound(Ascii("TO|000007|SORTER_3|MP-12"), out var inbound);

        Assert.True(parsed);
        Assert.Equal(InboundSimKind.TransportOrder, inbound.Kind);
        Assert.Equal(7, inbound.TelegramId);
        Assert.Equal("SORTER_3", inbound.Destination);
        Assert.Equal("MP-12", inbound.DestinationMp);
    }

    [Fact]
    public void TryParseInbound_FourPartTransportOrder_EmptyNextMp_IsNull()
    {
        var parsed = SimulationTelegramCodec.TryParseInbound(Ascii("TO|7|X|"), out var inbound);

        Assert.True(parsed);
        Assert.Equal(InboundSimKind.TransportOrder, inbound.Kind);
        Assert.Equal("X", inbound.Destination);
        Assert.Null(inbound.DestinationMp);
    }

    [Theory]
    [InlineData("")]
    [InlineData("MANUAL")]
    [InlineData("ACK|notanint|A")]
    [InlineData("ACK|1|X")]
    [InlineData("TO|1|")]
    [InlineData("MP|1|TU-1|MP3|N")]
    [InlineData("ACK|5|A|X")]
    [InlineData("TO|5||MP-12")]
    [InlineData("MP|1|TU-1|MP3")]
    public void TryParseInbound_Rejects_MalformedOrOutboundFrames(string text)
    {
        var parsed = SimulationTelegramCodec.TryParseInbound(Ascii(text), out _);

        Assert.False(parsed);
    }

    [Fact]
    public void TryParseInbound_RawAckSentinelByte_IsRejected()
    {
        // The TcpPlcServer auto-ACK is a bare 0x06 frame, not an "ACK|..." message.
        var parsed = SimulationTelegramCodec.TryParseInbound(new byte[] { 0x06 }, out _);

        Assert.False(parsed);
    }

    [Fact]
    public void TryParseInbound_EmptyPayload_IsRejected()
    {
        Assert.False(SimulationTelegramCodec.TryParseInbound([], out _));
    }

    [Fact]
    public void EncodeMpPayload_ReturnsPayloadVerbatim()
    {
        // ADR-0009: the frontend already encoded every field (including the id); the backend relays
        // the bytes unchanged.
        var encoded = new EncodedMpTelegram(new byte[] { 0xAA, 0x00, 0x2A, 0xDD });

        var bytes = SimulationTelegramCodec.EncodeMpPayload(encoded);

        Assert.Equal(new byte[] { 0xAA, 0x00, 0x2A, 0xDD }, bytes);
    }

    [Fact]
    public void EncodeMpPayload_ReturnsCopy_AndDoesNotMutateInput()
    {
        var payload = new byte[] { 1, 2, 3 };
        var encoded = new EncodedMpTelegram(payload);

        var bytes = SimulationTelegramCodec.EncodeMpPayload(encoded);

        // A fresh array is returned so the caller can frame it without touching the source.
        Assert.NotSame(payload, bytes);
        bytes[0] = 0x99;
        Assert.Equal(new byte[] { 1, 2, 3 }, payload);
    }

    [Fact]
    public void EncodeMpPayload_Null_Throws()
    {
        Assert.Throws<ArgumentNullException>(() => SimulationTelegramCodec.EncodeMpPayload(null!));
    }

    private static byte[] Ascii(string text) => Encoding.ASCII.GetBytes(text);
}

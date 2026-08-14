using System.Text;
using PlcTelegramSimulator.Application.Simulation;
using PlcTelegramSimulator.Infrastructure.Transport.Simulation;

namespace PlcTelegramSimulator.Infrastructure.IntegrationTests;

public sealed class SimulationTelegramCodecTests
{
    [Fact]
    public void EncodeMp_ProducesPipeDelimitedStatusN()
    {
        var telegram = new MpTelegram(7, "TU-1", "MP3");

        var text = Encoding.ASCII.GetString(SimulationTelegramCodec.EncodeMp(telegram));

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
    public void TryParseInbound_TransportOrder_ParsesIdAndDestination()
    {
        var parsed = SimulationTelegramCodec.TryParseInbound(Ascii("TO|42|DEST-Z"), out var inbound);

        Assert.True(parsed);
        Assert.Equal(InboundSimKind.TransportOrder, inbound.Kind);
        Assert.Equal(42, inbound.TelegramId);
        Assert.Equal("DEST-Z", inbound.Destination);
    }

    [Theory]
    [InlineData("")]
    [InlineData("MANUAL")]
    [InlineData("ACK|notanint|A")]
    [InlineData("ACK|1|X")]
    [InlineData("TO|1|")]
    [InlineData("MP|1|TU-1|MP3|N")]
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

    private static byte[] Ascii(string text) => Encoding.ASCII.GetBytes(text);
}

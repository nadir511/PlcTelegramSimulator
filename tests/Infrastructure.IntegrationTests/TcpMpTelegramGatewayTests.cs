using System.Text;
using PlcTelegramSimulator.Application.Simulation;
using PlcTelegramSimulator.Infrastructure.IntegrationTests.Fakes;
using PlcTelegramSimulator.Infrastructure.Transport.Simulation;

namespace PlcTelegramSimulator.Infrastructure.IntegrationTests;

public sealed class TcpMpTelegramGatewayTests
{
    [Fact]
    public async Task SendAsync_EncodesMpTelegram_OntoTransport_WithZeroPaddedId()
    {
        var transport = new FakePlcTransport();
        var gateway = new TcpMpTelegramGateway(transport, new SimulationCodecOptions());

        await gateway.SendAsync(new MpTelegram(5, "TU-1", "MP2"), CancellationToken.None);

        var sent = Assert.Single(transport.Sent);
        Assert.Equal("MP|000005|TU-1|MP2|N", Encoding.ASCII.GetString([.. sent]));
    }

    [Fact]
    public async Task SendAsync_HonorsConfiguredTelegramIdWidth()
    {
        var transport = new FakePlcTransport();
        var gateway = new TcpMpTelegramGateway(transport, new SimulationCodecOptions { TelegramIdWidth = 0 });

        await gateway.SendAsync(new MpTelegram(5, "TU-1", "MP2"), CancellationToken.None);

        var sent = Assert.Single(transport.Sent);
        Assert.Equal("MP|5|TU-1|MP2|N", Encoding.ASCII.GetString([.. sent]));
    }

    [Fact]
    public async Task SendAsync_EncodedPresent_RelaysPayloadVerbatim()
    {
        var transport = new FakePlcTransport();
        var gateway = new TcpMpTelegramGateway(transport, new SimulationCodecOptions());
        // ADR-0009: the frontend already encoded the id into the bytes; the gateway relays them as-is.
        var encoded = new EncodedMpTelegram(new byte[] { 0xAA, 0x01, 0x02, 0xBB });

        await gateway.SendAsync(new MpTelegram(258, "TU-1", "MP2", encoded), CancellationToken.None);

        var sent = Assert.Single(transport.Sent);
        byte[] actual = [.. sent];
        Assert.Equal(new byte[] { 0xAA, 0x01, 0x02, 0xBB }, actual);
    }

    [Fact]
    public async Task SendAsync_EncodedNull_FallsBackToInterimEncodeMp()
    {
        var transport = new FakePlcTransport();
        var gateway = new TcpMpTelegramGateway(transport, new SimulationCodecOptions());

        await gateway.SendAsync(new MpTelegram(5, "TU-1", "MP2", Encoded: null), CancellationToken.None);

        var sent = Assert.Single(transport.Sent);
        Assert.Equal("MP|000005|TU-1|MP2|N", Encoding.ASCII.GetString([.. sent]));
    }
}

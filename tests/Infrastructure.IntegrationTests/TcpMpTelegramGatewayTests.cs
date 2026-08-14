using System.Text;
using PlcTelegramSimulator.Application.Simulation;
using PlcTelegramSimulator.Infrastructure.IntegrationTests.Fakes;
using PlcTelegramSimulator.Infrastructure.Transport.Simulation;

namespace PlcTelegramSimulator.Infrastructure.IntegrationTests;

public sealed class TcpMpTelegramGatewayTests
{
    [Fact]
    public async Task SendAsync_EncodesMpTelegram_OntoTransport()
    {
        var transport = new FakePlcTransport();
        var gateway = new TcpMpTelegramGateway(transport);

        await gateway.SendAsync(new MpTelegram(5, "TU-1", "MP2"), CancellationToken.None);

        var sent = Assert.Single(transport.Sent);
        Assert.Equal("MP|5|TU-1|MP2|N", Encoding.ASCII.GetString([.. sent]));
    }
}

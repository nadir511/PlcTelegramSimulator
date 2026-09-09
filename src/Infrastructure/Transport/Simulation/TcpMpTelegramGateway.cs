using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Application.Simulation;

namespace PlcTelegramSimulator.Infrastructure.Transport.Simulation;

/// <summary>
/// Outbound TCP adapter implementing <see cref="IMpTelegramGateway"/> (ADR-0012). Encodes MP reports
/// with <see cref="SimulationTelegramCodec"/> and sends them through <see cref="IPlcTransport"/>.
/// Inbound acknowledgements and transport orders are handled separately by
/// <see cref="TcpInboundTelegramRouter"/>; keeping send and receive apart avoids a dependency cycle
/// (the orchestrator needs this gateway, while inbound routing needs the simulation engine).
/// </summary>
public sealed class TcpMpTelegramGateway : IMpTelegramGateway
{
    private readonly IPlcTransport _transport;
    private readonly SimulationCodecOptions _options;

    public TcpMpTelegramGateway(IPlcTransport transport, SimulationCodecOptions options)
    {
        _transport = transport;
        _options = options;
    }

    public Task SendAsync(MpTelegram telegram, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(telegram);

        var bytes = telegram.Encoded is { } encoded
            ? SimulationTelegramCodec.EncodeMpPayload(encoded)
            : SimulationTelegramCodec.EncodeMp(telegram, _options.TelegramIdWidth);

        return _transport.SendAsync(bytes, cancellationToken);
    }
}

using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using PlcTelegramSimulator.Application.Abstractions;

namespace PlcTelegramSimulator.Infrastructure.Transport.Simulation;

/// <summary>
/// Routes inbound acknowledgements and transport orders from the PLC transport back to the
/// single-writer <see cref="ISimulationEngine"/> (ADR-0012). A hosted service so it subscribes to
/// <see cref="IPlcTransport.TelegramReceived"/> on startup and unsubscribes on shutdown.
/// <para>
/// Kept separate from <see cref="TcpMpTelegramGateway"/> on purpose: the gateway is a dependency of
/// the orchestrator (outbound MP), while this router depends on the engine (inbound ACK/TO). Merging
/// them would form a construction cycle (engine → orchestrator → gateway → engine). Nothing depends
/// on this router, so the graph stays acyclic.
/// </para>
/// The handler never throws on the socket read thread; the engine's <c>Try*</c> methods are
/// non-blocking enqueues, so correlation stays on the simulation loop.
/// </summary>
public sealed class TcpInboundTelegramRouter : IHostedService
{
    private readonly IPlcTransport _transport;
    private readonly ISimulationEngine _engine;
    private readonly ILogger<TcpInboundTelegramRouter> _logger;

    public TcpInboundTelegramRouter(
        IPlcTransport transport,
        ISimulationEngine engine,
        ILogger<TcpInboundTelegramRouter> logger)
    {
        _transport = transport;
        _engine = engine;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _transport.TelegramReceived += OnTelegramReceived;
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _transport.TelegramReceived -= OnTelegramReceived;
        return Task.CompletedTask;
    }

    private void OnTelegramReceived(IReadOnlyList<byte> frame)
    {
        try
        {
            if (!SimulationTelegramCodec.TryParseInbound(frame, out var inbound))
            {
                return;
            }

            switch (inbound.Kind)
            {
                case InboundSimKind.Acknowledgement:
                    _engine.TryAcknowledge(inbound.TelegramId);
                    break;
                case InboundSimKind.TransportOrder:
                    _engine.TryResolveTransportOrder(inbound.TelegramId, inbound.Destination);
                    break;
            }
        }
        catch (Exception ex)
        {
            // A malformed frame must never fault the socket read loop.
            _logger.LogWarning(ex, "Failed to route an inbound simulation telegram.");
        }
    }
}

using System.Threading.Channels;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using PlcTelegramSimulator.Application.Abstractions;

namespace PlcTelegramSimulator.Application.Simulation;

/// <summary>
/// The single-writer simulation loop (ADR-0012). All simulation state — the <see cref="MpOrchestrator"/>
/// and its pending-request registry — is mutated by exactly one deterministic reader. Socket read
/// threads, the REST command, and the periodic timeout sweep never touch that state directly: they
/// enqueue <see cref="SimulationInput"/> values through <see cref="ISimulationEngine"/>, which this
/// loop drains in order. This actor discipline is what keeps concurrent, out-of-order ACK/TO
/// arrivals race-free without locking.
/// <para>
/// Runs as an <see cref="IHostedService"/>: <see cref="StartAsync"/> starts the drain pump and a
/// periodic sweeper; <see cref="StopAsync"/> completes the inbox and lets the pump drain. Registered
/// as a singleton and as the hosted service (same instance).
/// </para>
/// </summary>
public sealed class SimulationLoop : ISimulationEngine, IHostedService
{
    private readonly MpOrchestrator _orchestrator;
    private readonly SimulationLoopOptions _options;
    private readonly ILogger<SimulationLoop> _logger;

    private readonly Channel<SimulationInput> _inbox = Channel.CreateUnbounded<SimulationInput>(
        new UnboundedChannelOptions { SingleReader = true });

    private CancellationTokenSource? _cts;
    private Task? _pump;
    private Task? _sweeper;

    public SimulationLoop(
        MpOrchestrator orchestrator,
        SimulationLoopOptions options,
        ILogger<SimulationLoop> logger)
    {
        _orchestrator = orchestrator;
        _options = options;
        _logger = logger;
    }

    /// <summary>The number of MP requests currently awaiting an ACK or TO.</summary>
    public int OutstandingCount => _orchestrator.OutstandingCount;

    public bool TryReportArrival(
        string transportUnitId, string messagePointId, int? telegramId, EncodedMpTelegram? telegram)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(transportUnitId);
        ArgumentException.ThrowIfNullOrWhiteSpace(messagePointId);

        return _inbox.Writer.TryWrite(
            new SimulationInput.ReportArrival(transportUnitId, messagePointId, telegramId, telegram));
    }

    public bool TryAcknowledge(int telegramId) =>
        _inbox.Writer.TryWrite(new SimulationInput.AcknowledgeReceipt(telegramId));

    public bool TryResolveTransportOrder(int telegramId, string destination, string? destinationMp)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(destination);

        return _inbox.Writer.TryWrite(
            new SimulationInput.ResolveTransportOrder(telegramId, destination, destinationMp));
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _cts = new CancellationTokenSource();
        _pump = PumpAsync(_cts.Token);
        _sweeper = SweepAsync(_cts.Token);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _inbox.Writer.TryComplete();

        if (_pump is not null)
        {
            try
            {
                // Let the pump drain queued inputs, bounded by the host shutdown token.
                await _pump.WaitAsync(cancellationToken);
            }
            catch (OperationCanceledException)
            {
                // Shutdown timed out; the pump is force-cancelled below.
            }
        }

        if (_cts is not null)
        {
            await _cts.CancelAsync();
        }

        if (_sweeper is not null)
        {
            try
            {
                await _sweeper;
            }
            catch (OperationCanceledException)
            {
                // Graceful shutdown.
            }
        }

        _cts?.Dispose();
        _cts = null;
    }

    /// <summary>
    /// Applies a single input to the orchestrator. Internal so tests can drive the loop
    /// deterministically without racing the pump.
    /// </summary>
    internal async Task ProcessAsync(SimulationInput input, CancellationToken cancellationToken)
    {
        switch (input)
        {
            case SimulationInput.ReportArrival arrival:
                await _orchestrator.ReportArrivalAsync(
                    arrival.TransportUnitId,
                    arrival.MessagePointId,
                    arrival.TelegramId,
                    arrival.Telegram,
                    cancellationToken);
                break;
            case SimulationInput.AcknowledgeReceipt ack:
                _orchestrator.Acknowledge(ack.TelegramId);
                break;
            case SimulationInput.ResolveTransportOrder order:
                await _orchestrator.ResolveAsync(
                    order.TelegramId, order.Destination, order.DestinationMp, cancellationToken);
                break;
            case SimulationInput.SweepTimeouts:
                await _orchestrator.CheckTimeoutsAsync(cancellationToken);
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(input), input, "Unknown simulation input.");
        }
    }

    private async Task PumpAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var input in _inbox.Reader.ReadAllAsync(cancellationToken))
            {
                try
                {
                    await ProcessAsync(input, cancellationToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    // One bad input must never tear down the single-writer loop.
                    _logger.LogWarning(ex, "Simulation input {Input} failed to process.", input);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Graceful shutdown.
        }
    }

    private async Task SweepAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(_options.TimeoutSweepInterval);
        try
        {
            while (await timer.WaitForNextTickAsync(cancellationToken))
            {
                // Enqueue rather than sweep inline so timeouts run on the single-writer pump.
                _inbox.Writer.TryWrite(new SimulationInput.SweepTimeouts());
            }
        }
        catch (OperationCanceledException)
        {
            // Graceful shutdown.
        }
    }
}

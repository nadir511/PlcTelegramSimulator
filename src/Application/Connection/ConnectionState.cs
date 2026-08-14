using System.Threading.Channels;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Domain;

namespace PlcTelegramSimulator.Application.Connection;

/// <summary>
/// Holds the current listener status and fans transport events out to the
/// real-time channel (Observer pattern). Runs as an <see cref="IHostedService"/>:
/// it subscribes to <see cref="IPlcTransport"/> on start and unsubscribes on stop.
/// Broadcasts are serialized through an unbounded channel drained by a single
/// pump so a slow/broken client cannot reorder events or block the transport.
/// Registered as a singleton and as the hosted service (same instance).
/// </summary>
public sealed class ConnectionState : IHostedService
{
    private readonly IPlcTransport _transport;
    private readonly IConnectionBroadcaster _broadcaster;
    private readonly ILogger<ConnectionState> _logger;

    private readonly Channel<Broadcast> _outbox = Channel.CreateUnbounded<Broadcast>(
        new UnboundedChannelOptions { SingleReader = true });

    private readonly Lock _gate = new();
    private ListenerStatus _status = ListenerStatus.Stopped;
    private string? _error;

    private CancellationTokenSource? _cts;
    private Task? _pump;

    public ConnectionState(
        IPlcTransport transport,
        IConnectionBroadcaster broadcaster,
        ILogger<ConnectionState> logger)
    {
        _transport = transport;
        _broadcaster = broadcaster;
        _logger = logger;
    }

    /// <summary>Returns the current listener status/error snapshot.</summary>
    public ConnectionSnapshot Snapshot()
    {
        lock (_gate)
        {
            return new ConnectionSnapshot(_status, _error);
        }
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _cts = new CancellationTokenSource();
        _transport.StatusChanged += OnStatusChanged;
        _transport.TrafficObserved += OnTrafficObserved;
        _pump = PumpAsync(_cts.Token);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _transport.StatusChanged -= OnStatusChanged;
        _transport.TrafficObserved -= OnTrafficObserved;
        _outbox.Writer.TryComplete();

        if (_pump is not null)
        {
            try
            {
                // Let the pump drain queued broadcasts, bounded by the host shutdown token.
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
            _cts.Dispose();
            _cts = null;
        }
    }

    private void OnStatusChanged(ListenerStatus status, string? error)
    {
        lock (_gate)
        {
            _status = status;
            _error = error;
        }

        _outbox.Writer.TryWrite(Broadcast.ForStatus(status, error));
    }

    private void OnTrafficObserved(TrafficEntry entry) =>
        _outbox.Writer.TryWrite(Broadcast.ForTraffic(entry));

    private async Task PumpAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var broadcast in _outbox.Reader.ReadAllAsync(cancellationToken))
            {
                try
                {
                    if (broadcast.Entry is { } entry)
                    {
                        await _broadcaster.TrafficAsync(entry, cancellationToken);
                    }
                    else
                    {
                        await _broadcaster.StatusAsync(broadcast.Status, broadcast.Error, cancellationToken);
                    }
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    // A slow or broken real-time client must not tear down the transport.
                    _logger.LogWarning(ex, "Failed to broadcast a connection update to real-time clients.");
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Graceful shutdown.
        }
    }

    /// <summary>A queued broadcast: a status change when <see cref="Entry"/> is null, else a traffic entry.</summary>
    private readonly record struct Broadcast(ListenerStatus Status, string? Error, TrafficEntry? Entry)
    {
        public static Broadcast ForStatus(ListenerStatus status, string? error) => new(status, error, Entry: null);

        public static Broadcast ForTraffic(TrafficEntry entry) => new(default, Error: null, entry);
    }
}

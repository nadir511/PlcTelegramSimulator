using System.IO.Pipelines;
using System.Net;
using System.Net.Sockets;
using Microsoft.Extensions.Logging;
using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Domain;
using PlcTelegramSimulator.Infrastructure.Framing;

namespace PlcTelegramSimulator.Infrastructure.Transport;

/// <summary>
/// Simulated PLC over TCP (Adapter over <see cref="System.Net.Sockets"/> behind
/// <see cref="IPlcTransport"/>). It binds two listeners:
/// <list type="bullet">
///   <item><description><b>receive</b> port: accepts a client, treats inbound frames as
///   telegrams to process, and replies with a framed ACK after the configured delay;</description></item>
///   <item><description><b>send</b> port: accepts a client that receives manual outbound
///   telegrams (and whose own writes are surfaced as inbound "RX" traffic).</description></item>
/// </list>
/// Status is <see cref="ListenerStatus.Connected"/> whenever a client is connected on
/// either port and falls back to <see cref="ListenerStatus.Listening"/> otherwise. All
/// socket I/O is async and honors the session token; a single client error is surfaced
/// as an error entry and never tears down the server.
/// </summary>
public sealed class TcpPlcServer : IPlcTransport, IAsyncDisposable
{
    private static readonly IReadOnlyList<byte> AckPayload = new byte[] { 0x06 };

    // Pre-start fallback only ('~'); StartAsync overwrites this from the session's
    // configured End-of-Telegram before any client can connect, send, or be framed.
    private static readonly byte[] DefaultTerminator = { 0x7E };

    private readonly ITelegramFramer _framer;
    private readonly ILogger<TcpPlcServer> _logger;

    private readonly SemaphoreSlim _lifecycleGate = new(1, 1);
    private readonly SemaphoreSlim _sendGate = new(1, 1);
    private readonly Lock _statusGate = new();
    private readonly Lock _txGate = new();

    private ListenerStatus _statusValue = ListenerStatus.Stopped;
    private string? _errorValue;

    private int _rxClients;
    private int _txClients;
    private NetworkStream? _txStream;
    private volatile byte[] _terminator = DefaultTerminator;

    private CancellationTokenSource? _sessionCts;
    private TcpListener? _rxListener;
    private TcpListener? _txListener;
    private Task? _rxLoop;
    private Task? _txLoop;
    private volatile bool _running;

    public TcpPlcServer(ITelegramFramer framer, ILogger<TcpPlcServer> logger)
    {
        _framer = framer;
        _logger = logger;
    }

    public event Action<ListenerStatus, string?>? StatusChanged;

    public event Action<TrafficEntry>? TrafficObserved;

    public event Action<IReadOnlyList<byte>>? TelegramReceived;

    public async Task StartAsync(ListenerConfig config, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(config);

        await _lifecycleGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (_running)
            {
                return; // already running: no-op
            }

            SetStatus(ListenerStatus.Starting, null);

            if (!IPAddress.TryParse(config.BindAddress, out var address))
            {
                SetStatus(ListenerStatus.Error, $"Invalid bind address '{config.BindAddress}'.");
                RaiseTraffic(TrafficEntry.Error($"Invalid bind address '{config.BindAddress}'."));
                return;
            }

            var rxListener = new TcpListener(address, config.ReceivePort);
            var txListener = new TcpListener(address, config.SendPort);
            try
            {
                rxListener.Start();
                txListener.Start();
            }
            catch (SocketException ex)
            {
                SafeStop(rxListener);
                SafeStop(txListener);
                SetStatus(ListenerStatus.Error, ex.Message);
                RaiseTraffic(TrafficEntry.Error($"Failed to bind listener: {ex.Message}"));
                return;
            }

            _rxListener = rxListener;
            _txListener = txListener;

            // Deliberately NOT linked to cancellationToken: that is the HTTP request
            // token and the listener must outlive the request that started it. The
            // session ends only via StopAsync/DisposeAsync.
            _sessionCts = new CancellationTokenSource();
            var token = _sessionCts.Token;
            _running = true;
            _terminator = config.Terminator as byte[] ?? config.Terminator.ToArray();

            SetStatus(ListenerStatus.Listening, null);
            RaiseTraffic(TrafficEntry.System(
                $"Listener bound to {config.BindAddress} (rx {config.ReceivePort} / tx {config.SendPort})"
                + $"; End-of-Telegram '{config.EndOfTelegram}'"));

            _rxLoop = Task.Run(() => AcceptLoopAsync(rxListener, PortRole.Receive, config, token), token);
            _txLoop = Task.Run(() => AcceptLoopAsync(txListener, PortRole.Send, config, token), token);
        }
        finally
        {
            _lifecycleGate.Release();
        }
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        await _lifecycleGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (!_running)
            {
                return; // no-op when already stopped
            }

            _running = false;

            if (_sessionCts is not null)
            {
                await _sessionCts.CancelAsync().ConfigureAwait(false);
            }

            SafeStop(_rxListener);
            SafeStop(_txListener);

            await AwaitLoopAsync(_rxLoop).ConfigureAwait(false);
            await AwaitLoopAsync(_txLoop).ConfigureAwait(false);

            _rxListener = null;
            _txListener = null;
            _rxLoop = null;
            _txLoop = null;
            _sessionCts?.Dispose();
            _sessionCts = null;

            Interlocked.Exchange(ref _rxClients, 0);
            Interlocked.Exchange(ref _txClients, 0);
            lock (_txGate)
            {
                _txStream = null;
            }

            SetStatus(ListenerStatus.Stopped, null);
            RaiseTraffic(TrafficEntry.System("Listener stopped"));
        }
        finally
        {
            _lifecycleGate.Release();
        }
    }

    public async Task SendAsync(IReadOnlyList<byte> payload, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(payload);

        NetworkStream? stream;
        lock (_txGate)
        {
            stream = _txStream;
        }

        if (stream is null)
        {
            RaiseTraffic(TrafficEntry.System("Cannot send: no client connected"));
            return;
        }

        var frame = _framer.Encode(payload, _terminator);

        await _sendGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await stream.WriteAsync(frame, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is IOException or ObjectDisposedException or SocketException)
        {
            RaiseTraffic(TrafficEntry.Error($"Send failed: {ex.Message}"));
            return;
        }
        finally
        {
            _sendGate.Release();
        }

        RaiseTraffic(TrafficEntry.Outbound(payload, "MANUAL"));
    }

    private async Task AcceptLoopAsync(TcpListener listener, PortRole role, ListenerConfig config, CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            TcpClient client;
            try
            {
                client = await listener.AcceptTcpClientAsync(token).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (ObjectDisposedException)
            {
                break;
            }
            catch (SocketException ex)
            {
                if (!token.IsCancellationRequested)
                {
                    RaiseTraffic(TrafficEntry.Error($"Accept failed on {RoleTag(role)} port: {ex.SocketErrorCode}"));
                }

                break;
            }

            // A pending NetworkStream read does not observe token cancellation on
            // Windows, so closing the socket is what actually unblocks it. Disposing the
            // accepted client when the session is cancelled (Stop/Dispose) tears the
            // connection down instead of leaving the peer connected.
            using var cancelRegistration = token.Register(static state => SafeDisposeClient(state), client);

            try
            {
                await HandleClientAsync(client, role, config, token).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                // Session stopping.
            }
            catch (Exception ex)
            {
                RaiseTraffic(TrafficEntry.Error($"{RoleTag(role)} client error: {ex.Message}"));
            }
            finally
            {
                client.Dispose();
            }

            if (!config.AutoAcceptReconnections)
            {
                break;
            }
        }
    }

    private async Task HandleClientAsync(TcpClient client, PortRole role, ListenerConfig config, CancellationToken token)
    {
        var remote = client.Client.RemoteEndPoint?.ToString() ?? "unknown";
        var tag = RoleTag(role);
        var stream = client.GetStream();

        if (role == PortRole.Receive)
        {
            Interlocked.Increment(ref _rxClients);
        }
        else
        {
            Interlocked.Increment(ref _txClients);
            lock (_txGate)
            {
                _txStream = stream;
            }
        }

        RecomputeConnectivity();
        RaiseTraffic(TrafficEntry.System($"Client connected from {remote} ({tag})"));

        try
        {
            var pipe = PipeReader.Create(stream, new StreamPipeReaderOptions(leaveOpen: true));
            await foreach (var frame in _framer.ReadFramesAsync(pipe, _terminator, OnFramingError, token).ConfigureAwait(false))
            {
                if (role == PortRole.Receive)
                {
                    RaiseTraffic(TrafficEntry.Inbound(frame, label: null));
                    RaiseTelegram(frame);

                    // Model controller latency, then acknowledge on the same socket.
                    await Task.Delay(config.ProcessingDelay, token).ConfigureAwait(false);
                    await WriteFrameAsync(stream, AckPayload, token).ConfigureAwait(false);
                    RaiseTraffic(TrafficEntry.Outbound(AckPayload, "ACK"));
                }
                else
                {
                    // A peer writing on the send port is surfaced as inbound traffic.
                    RaiseTraffic(TrafficEntry.Inbound(frame, "RX"));
                    RaiseTelegram(frame);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Session stopping.
        }
        catch (Exception ex) when (ex is IOException or SocketException or ObjectDisposedException)
        {
            // A read failing because the socket was disposed during Stop is expected;
            // only surface genuine mid-session read errors.
            if (!token.IsCancellationRequested)
            {
                RaiseTraffic(TrafficEntry.Error($"{tag} read error: {ex.Message}"));
            }
        }
        finally
        {
            if (role == PortRole.Receive)
            {
                Interlocked.Decrement(ref _rxClients);
            }
            else
            {
                Interlocked.Decrement(ref _txClients);
                lock (_txGate)
                {
                    if (ReferenceEquals(_txStream, stream))
                    {
                        _txStream = null;
                    }
                }
            }

            if (!token.IsCancellationRequested)
            {
                RaiseTraffic(TrafficEntry.System($"Client disconnected ({tag})"));
            }

            RecomputeConnectivity();
        }
    }

    private async Task WriteFrameAsync(NetworkStream stream, IReadOnlyList<byte> payload, CancellationToken token)
    {
        var frame = _framer.Encode(payload, _terminator);
        await stream.WriteAsync(frame, token).ConfigureAwait(false);
    }

    private void OnFramingError(string message) => RaiseTraffic(TrafficEntry.Error(message));

    private void RecomputeConnectivity()
    {
        if (!_running)
        {
            return; // Stop path owns the terminal status.
        }

        var total = Volatile.Read(ref _rxClients) + Volatile.Read(ref _txClients);
        SetStatus(total > 0 ? ListenerStatus.Connected : ListenerStatus.Listening, null);
    }

    private void SetStatus(ListenerStatus status, string? error)
    {
        bool changed;
        lock (_statusGate)
        {
            changed = _statusValue != status || _errorValue != error;
            _statusValue = status;
            _errorValue = error;
        }

        if (changed)
        {
            StatusChanged?.Invoke(status, error);
        }
    }

    private void RaiseTraffic(TrafficEntry entry) => TrafficObserved?.Invoke(entry);

    private void RaiseTelegram(IReadOnlyList<byte> frame) => TelegramReceived?.Invoke(frame);

    private async Task AwaitLoopAsync(Task? loop)
    {
        if (loop is null)
        {
            return;
        }

        try
        {
            await loop.ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            // Accept loops surface their own faults as traffic; log defensively.
            _logger.LogDebug(ex, "Accept loop ended with an exception during shutdown.");
        }
    }

    private static void SafeStop(TcpListener? listener)
    {
        if (listener is null)
        {
            return;
        }

        try
        {
            listener.Stop();
        }
        catch (SocketException)
        {
            // Already closing.
        }
        catch (ObjectDisposedException)
        {
            // Already disposed.
        }
    }

    private static void SafeDisposeClient(object? state)
    {
        if (state is not TcpClient client)
        {
            return;
        }

        try
        {
            client.Dispose();
        }
        catch (SocketException)
        {
            // Already closing.
        }
        catch (ObjectDisposedException)
        {
            // Already disposed.
        }
    }

    private static string RoleTag(PortRole role) => role == PortRole.Receive ? "rx" : "tx";

    public async ValueTask DisposeAsync()
    {
        await StopAsync(CancellationToken.None).ConfigureAwait(false);
        _lifecycleGate.Dispose();
        _sendGate.Dispose();
    }

    private enum PortRole
    {
        Receive,
        Send,
    }
}

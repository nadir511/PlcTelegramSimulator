using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using Microsoft.Extensions.Logging.Abstractions;
using PlcTelegramSimulator.Domain;
using PlcTelegramSimulator.Infrastructure.Framing;
using PlcTelegramSimulator.Infrastructure.Transport;

namespace PlcTelegramSimulator.Infrastructure.IntegrationTests;

public sealed class TcpPlcServerTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(5);

    [Fact]
    public async Task ReceivePort_InboundTelegram_ObservedAndAcknowledged()
    {
        var (rxPort, txPort) = FreePortPair();
        var recorder = new EventRecorder();
        var framer = new EofTelegramFramer();
        await using var server = new TcpPlcServer(framer, NullLogger<TcpPlcServer>.Instance);
        recorder.Attach(server);

        var config = ListenerConfig.Create("127.0.0.1", txPort, rxPort, processingDelayMs: 50, autoAcceptReconnections: true);
        await server.StartAsync(config, CancellationToken.None);

        try
        {
            await recorder.WaitForStatusAsync(ListenerStatus.Listening, Timeout);

            using var client = new TcpClient();
            await client.ConnectAsync(IPAddress.Loopback, rxPort);
            var stream = client.GetStream();

            await recorder.WaitForStatusAsync(ListenerStatus.Connected, Timeout);

            var payload = new byte[] { 0x4d, 0x50, 0x30, 0x31 };
            await stream.WriteAsync(framer.Encode(payload));

            // Inbound telegram is observed with the exact payload.
            await recorder.WaitForTrafficAsync(
                e => e.Level == TrafficLevel.Inbound && e.Payload is not null && e.Payload.SequenceEqual(payload),
                Timeout);

            // An ACK (0x06) is observed after the processing delay...
            await recorder.WaitForTrafficAsync(
                e => e.Level == TrafficLevel.Outbound && e.Label == "ACK" && e.Payload is [0x06],
                Timeout);

            // ...and the ACK frame is actually delivered back on the same socket.
            var ackFrame = await ReadExactAsync(stream, 2, Timeout);
            Assert.Equal(new byte[] { 0x06, 0x7E }, ackFrame);
        }
        finally
        {
            await server.StopAsync(CancellationToken.None);
        }

        await recorder.WaitForStatusAsync(ListenerStatus.Stopped, Timeout);
    }

    [Fact]
    public async Task SendPort_ManualTelegram_DeliveredToClientAndObserved()
    {
        var (rxPort, txPort) = FreePortPair();
        var recorder = new EventRecorder();
        var framer = new EofTelegramFramer();
        await using var server = new TcpPlcServer(framer, NullLogger<TcpPlcServer>.Instance);
        recorder.Attach(server);

        var config = ListenerConfig.Create("127.0.0.1", txPort, rxPort, processingDelayMs: 10, autoAcceptReconnections: true);
        await server.StartAsync(config, CancellationToken.None);

        try
        {
            await recorder.WaitForStatusAsync(ListenerStatus.Listening, Timeout);

            using var client = new TcpClient();
            await client.ConnectAsync(IPAddress.Loopback, txPort);
            var stream = client.GetStream();

            await recorder.WaitForStatusAsync(ListenerStatus.Connected, Timeout);

            var payload = new byte[] { 0x53, 0x45, 0x30, 0x34 };
            await server.SendAsync(payload, CancellationToken.None);

            // The client receives the framed telegram.
            var frame = await ReadExactAsync(stream, payload.Length + 1, Timeout);
            Assert.Equal(framer.Encode(payload), frame);

            // A manual outbound entry is observed.
            await recorder.WaitForTrafficAsync(
                e => e.Level == TrafficLevel.Outbound && e.Label == "MANUAL" && e.Payload is not null && e.Payload.SequenceEqual(payload),
                Timeout);
        }
        finally
        {
            await server.StopAsync(CancellationToken.None);
        }

        await recorder.WaitForStatusAsync(ListenerStatus.Stopped, Timeout);
    }

    [Fact]
    public async Task SendPort_EhubStyleTelegram_HasNoStxAndEofTerminatorOnTheWire()
    {
        // Live socket hex capture for the eHub ATI wire format (ADR-0011): the frame must
        // start directly with the source name (no 0x02 STX) and end with a single '~' (0x7E).
        var (rxPort, txPort) = FreePortPair();
        var recorder = new EventRecorder();
        await using var server = new TcpPlcServer(new EofTelegramFramer(), NullLogger<TcpPlcServer>.Instance);
        recorder.Attach(server);

        var config = ListenerConfig.Create("127.0.0.1", txPort, rxPort, processingDelayMs: 10, autoAcceptReconnections: true);
        await server.StartAsync(config, CancellationToken.None);

        try
        {
            await recorder.WaitForStatusAsync(ListenerStatus.Listening, Timeout);

            using var client = new TcpClient();
            await client.ConnectAsync(IPAddress.Loopback, txPort);
            var stream = client.GetStream();

            await recorder.WaitForStatusAsync(ListenerStatus.Connected, Timeout);

            // 148-byte telegram: "CV05000001N" (11) + ' ' + "MP" + padding, matching the spec sample.
            var header = System.Text.Encoding.Latin1.GetBytes("CV05000001N MP");
            var payload = new byte[148];
            Array.Copy(header, payload, header.Length);
            for (var i = header.Length; i < payload.Length; i++)
            {
                payload[i] = 0x30; // '0' filler — never STX/EOF
            }

            await server.SendAsync(payload, CancellationToken.None);

            var frame = await ReadExactAsync(stream, payload.Length + 1, Timeout);

            Assert.Equal(149, frame.Length);          // 148 payload + 1 EOF (was 150 with STX/ETX)
            Assert.Equal(0x43, frame[0]);             // first wire byte is 'C', not 0x02
            Assert.DoesNotContain((byte)0x02, frame); // no STX anywhere
            Assert.Equal(0x7E, frame[^1]);            // trailing '~' EOF
            Assert.Equal(new byte[] { 0x4D, 0x50 }, frame[12..14]); // telegram type 'MP' at offset 12–13
        }
        finally
        {
            await server.StopAsync(CancellationToken.None);
        }
    }

    [Fact]
    public async Task SendAsync_WithNoClient_EmitsSystemEvent()
    {
        var (rxPort, txPort) = FreePortPair();
        var recorder = new EventRecorder();
        await using var server = new TcpPlcServer(new EofTelegramFramer(), NullLogger<TcpPlcServer>.Instance);
        recorder.Attach(server);

        var config = ListenerConfig.Create("127.0.0.1", txPort, rxPort, processingDelayMs: 10, autoAcceptReconnections: true);
        await server.StartAsync(config, CancellationToken.None);

        try
        {
            await recorder.WaitForStatusAsync(ListenerStatus.Listening, Timeout);

            await server.SendAsync(new byte[] { 0x01 }, CancellationToken.None);

            await recorder.WaitForTrafficAsync(
                e => e.Level == TrafficLevel.System && e.Message == "Cannot send: no client connected",
                Timeout);
        }
        finally
        {
            await server.StopAsync(CancellationToken.None);
        }
    }

    [Fact]
    public async Task StartAsync_WithPortInUse_ReportsError()
    {
        var (rxPort, txPort) = FreePortPair();

        // Occupy the receive port so the bind fails.
        using var blocker = new TcpListener(IPAddress.Loopback, rxPort);
        blocker.Start();

        var recorder = new EventRecorder();
        await using var server = new TcpPlcServer(new EofTelegramFramer(), NullLogger<TcpPlcServer>.Instance);
        recorder.Attach(server);

        var config = ListenerConfig.Create("127.0.0.1", txPort, rxPort, processingDelayMs: 10, autoAcceptReconnections: true);
        await server.StartAsync(config, CancellationToken.None);

        await recorder.WaitForStatusAsync(ListenerStatus.Error, Timeout);
        Assert.Contains(recorder.Traffic, e => e.Level == TrafficLevel.Error);
    }

    [Fact]
    public async Task StopAsync_WithConnectedClient_ClosesClientSocket()
    {
        var (rxPort, txPort) = FreePortPair();
        var recorder = new EventRecorder();
        var framer = new EofTelegramFramer();
        await using var server = new TcpPlcServer(framer, NullLogger<TcpPlcServer>.Instance);
        recorder.Attach(server);

        var config = ListenerConfig.Create("127.0.0.1", txPort, rxPort, processingDelayMs: 10, autoAcceptReconnections: true);
        await server.StartAsync(config, CancellationToken.None);
        await recorder.WaitForStatusAsync(ListenerStatus.Listening, Timeout);

        using var client = new TcpClient();
        await client.ConnectAsync(IPAddress.Loopback, rxPort);
        var stream = client.GetStream();
        await recorder.WaitForStatusAsync(ListenerStatus.Connected, Timeout);

        // Stopping the listener must tear down the accepted client socket, not just the
        // listening socket. It must complete promptly (never hang waiting on a read that
        // ignores cancellation) and the peer must observe the disconnect.
        await server.StopAsync(CancellationToken.None).WaitAsync(Timeout);
        await recorder.WaitForStatusAsync(ListenerStatus.Stopped, Timeout);

        await AssertClientDisconnectedAsync(stream, Timeout);
    }

    private static (int RxPort, int TxPort) FreePortPair()
    {
        var rx = GetFreePort();
        int tx;
        do
        {
            tx = GetFreePort();
        }
        while (tx == rx);

        return (rx, tx);
    }

    private static int GetFreePort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        try
        {
            return ((IPEndPoint)listener.LocalEndpoint).Port;
        }
        finally
        {
            listener.Stop();
        }
    }

    private static async Task<byte[]> ReadExactAsync(NetworkStream stream, int count, TimeSpan timeout)
    {
        using var cts = new CancellationTokenSource(timeout);
        var buffer = new byte[count];
        var offset = 0;
        while (offset < count)
        {
            var read = await stream.ReadAsync(buffer.AsMemory(offset, count - offset), cts.Token);
            if (read == 0)
            {
                throw new IOException($"Stream closed after {offset} of {count} bytes.");
            }

            offset += read;
        }

        return buffer;
    }

    private static async Task AssertClientDisconnectedAsync(NetworkStream stream, TimeSpan timeout)
    {
        var buffer = new byte[16];
        try
        {
            // WaitAsync (not the read's own token) guarantees this fails fast rather than
            // hanging if the server left the socket open, since a pending socket read does
            // not observe cancellation on Windows.
            var read = await stream.ReadAsync(buffer).AsTask().WaitAsync(timeout);
            Assert.Equal(0, read); // graceful close (FIN) surfaces as end-of-stream
        }
        catch (IOException)
        {
            // Connection reset (RST) is an equally valid disconnect signal.
        }
    }

    /// <summary>Records status/traffic events and lets tests await specific conditions.</summary>
    private sealed class EventRecorder
    {
        private readonly ConcurrentQueue<(ListenerStatus Status, string? Error)> _statuses = new();
        private readonly ConcurrentQueue<TrafficEntry> _traffic = new();

        public IReadOnlyCollection<TrafficEntry> Traffic => _traffic;

        public void Attach(TcpPlcServer server)
        {
            server.StatusChanged += (status, error) => _statuses.Enqueue((status, error));
            server.TrafficObserved += entry => _traffic.Enqueue(entry);
        }

        public Task WaitForStatusAsync(ListenerStatus status, TimeSpan timeout) =>
            WaitAsync(() => _statuses.Any(s => s.Status == status), timeout, $"status '{status}'");

        public Task WaitForTrafficAsync(Func<TrafficEntry, bool> predicate, TimeSpan timeout) =>
            WaitAsync(() => _traffic.Any(predicate), timeout, "matching traffic entry");

        private static async Task WaitAsync(Func<bool> condition, TimeSpan timeout, string description)
        {
            var deadline = DateTime.UtcNow + timeout;
            while (DateTime.UtcNow < deadline)
            {
                if (condition())
                {
                    return;
                }

                await Task.Delay(20);
            }

            throw new TimeoutException($"Timed out waiting for {description}.");
        }
    }
}

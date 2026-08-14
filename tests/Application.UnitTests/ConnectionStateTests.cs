using Microsoft.Extensions.Logging.Abstractions;
using PlcTelegramSimulator.Application.Connection;
using PlcTelegramSimulator.Application.UnitTests.Fakes;
using PlcTelegramSimulator.Domain;

namespace PlcTelegramSimulator.Application.UnitTests;

public sealed class ConnectionStateTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(2);

    [Fact]
    public async Task StatusChanged_UpdatesSnapshotAndForwardsToBroadcaster()
    {
        var transport = new FakeTransport();
        var broadcaster = new FakeBroadcaster();
        var state = new ConnectionState(transport, broadcaster, NullLogger<ConnectionState>.Instance);
        await state.StartAsync(CancellationToken.None);

        try
        {
            transport.RaiseStatus(ListenerStatus.Listening, null);
            await broadcaster.WaitForBroadcastsAsync(1, Timeout);

            Assert.Equal(ListenerStatus.Listening, state.Snapshot().Status);
            Assert.Null(state.Snapshot().Error);
            Assert.Contains((ListenerStatus.Listening, (string?)null), broadcaster.Statuses);
        }
        finally
        {
            await state.StopAsync(CancellationToken.None);
        }
    }

    [Fact]
    public async Task StatusChanged_WithError_CapturedInSnapshot()
    {
        var transport = new FakeTransport();
        var broadcaster = new FakeBroadcaster();
        var state = new ConnectionState(transport, broadcaster, NullLogger<ConnectionState>.Instance);
        await state.StartAsync(CancellationToken.None);

        try
        {
            transport.RaiseStatus(ListenerStatus.Error, "bind failed");
            await broadcaster.WaitForBroadcastsAsync(1, Timeout);

            var snapshot = state.Snapshot();
            Assert.Equal(ListenerStatus.Error, snapshot.Status);
            Assert.Equal("bind failed", snapshot.Error);
        }
        finally
        {
            await state.StopAsync(CancellationToken.None);
        }
    }

    [Fact]
    public async Task TrafficObserved_ForwardedToBroadcaster()
    {
        var transport = new FakeTransport();
        var broadcaster = new FakeBroadcaster();
        var state = new ConnectionState(transport, broadcaster, NullLogger<ConnectionState>.Instance);
        await state.StartAsync(CancellationToken.None);

        try
        {
            var entry = TrafficEntry.System("Listener stopped");
            transport.RaiseTraffic(entry);
            await broadcaster.WaitForBroadcastsAsync(1, Timeout);

            Assert.Contains(entry, broadcaster.Traffic);
        }
        finally
        {
            await state.StopAsync(CancellationToken.None);
        }
    }

    [Fact]
    public void Snapshot_DefaultsToStoppedBeforeAnyEvent()
    {
        var transport = new FakeTransport();
        var broadcaster = new FakeBroadcaster();
        var state = new ConnectionState(transport, broadcaster, NullLogger<ConnectionState>.Instance);

        var snapshot = state.Snapshot();

        Assert.Equal(ListenerStatus.Stopped, snapshot.Status);
        Assert.Null(snapshot.Error);
    }

    [Fact]
    public async Task StopAsync_UnsubscribesFromTransport()
    {
        var transport = new FakeTransport();
        var broadcaster = new FakeBroadcaster();
        var state = new ConnectionState(transport, broadcaster, NullLogger<ConnectionState>.Instance);
        await state.StartAsync(CancellationToken.None);
        await state.StopAsync(CancellationToken.None);

        // After stopping, further transport events must not reach the broadcaster.
        transport.RaiseStatus(ListenerStatus.Connected, null);

        Assert.DoesNotContain((ListenerStatus.Connected, (string?)null), broadcaster.Statuses);
    }
}

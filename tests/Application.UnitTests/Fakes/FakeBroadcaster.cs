using System.Collections.Concurrent;
using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Domain;

namespace PlcTelegramSimulator.Application.UnitTests.Fakes;

/// <summary>
/// Test double for <see cref="IConnectionBroadcaster"/>. Records every status and
/// traffic broadcast (thread-safe, since <see cref="Connection.ConnectionState"/>
/// pumps on a background task) and signals a <see cref="SemaphoreSlim"/> so tests
/// can await delivery without arbitrary sleeps.
/// </summary>
public sealed class FakeBroadcaster : IConnectionBroadcaster
{
    private readonly ConcurrentQueue<(ListenerStatus Status, string? Error)> _statuses = new();
    private readonly ConcurrentQueue<TrafficEntry> _traffic = new();
    private readonly SemaphoreSlim _signal = new(0);

    public IReadOnlyCollection<(ListenerStatus Status, string? Error)> Statuses => _statuses;

    public IReadOnlyCollection<TrafficEntry> Traffic => _traffic;

    public Task StatusAsync(ListenerStatus status, string? error, CancellationToken cancellationToken)
    {
        _statuses.Enqueue((status, error));
        _signal.Release();
        return Task.CompletedTask;
    }

    public Task TrafficAsync(TrafficEntry entry, CancellationToken cancellationToken)
    {
        _traffic.Enqueue(entry);
        _signal.Release();
        return Task.CompletedTask;
    }

    /// <summary>Waits until at least <paramref name="count"/> broadcasts have been recorded.</summary>
    public async Task WaitForBroadcastsAsync(int count, TimeSpan timeout)
    {
        using var cts = new CancellationTokenSource(timeout);
        for (var i = 0; i < count; i++)
        {
            await _signal.WaitAsync(cts.Token);
        }
    }
}

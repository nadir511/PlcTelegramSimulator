using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Domain;

namespace PlcTelegramSimulator.Application.UnitTests.Fakes;

/// <summary>
/// Test double for <see cref="IPlcTransport"/>. Records method calls and lets a
/// test raise the <see cref="StatusChanged"/> / <see cref="TrafficObserved"/>
/// events on demand.
/// </summary>
public sealed class FakeTransport : IPlcTransport
{
    private readonly List<ListenerConfig> _startCalls = [];
    private readonly List<IReadOnlyList<byte>> _sendCalls = [];

    public IReadOnlyList<ListenerConfig> StartCalls => _startCalls;

    public IReadOnlyList<IReadOnlyList<byte>> SendCalls => _sendCalls;

    public int StopCallCount { get; private set; }

    public event Action<ListenerStatus, string?>? StatusChanged;

    public event Action<TrafficEntry>? TrafficObserved;

    public event Action<IReadOnlyList<byte>>? TelegramReceived;

    public Task StartAsync(ListenerConfig config, CancellationToken cancellationToken)
    {
        _startCalls.Add(config);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        StopCallCount++;
        return Task.CompletedTask;
    }

    public Task SendAsync(IReadOnlyList<byte> payload, CancellationToken cancellationToken)
    {
        _sendCalls.Add(payload);
        return Task.CompletedTask;
    }

    public void RaiseStatus(ListenerStatus status, string? error = null) => StatusChanged?.Invoke(status, error);

    public void RaiseTraffic(TrafficEntry entry) => TrafficObserved?.Invoke(entry);

    public void RaiseTelegram(IReadOnlyList<byte> frame) => TelegramReceived?.Invoke(frame);
}

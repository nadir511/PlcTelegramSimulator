using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Domain;

namespace PlcTelegramSimulator.Infrastructure.IntegrationTests.Fakes;

/// <summary>
/// Test double for <see cref="IPlcTransport"/>. Records outbound sends and exposes
/// <see cref="RaiseTelegram"/> so a test can simulate a decoded inbound frame arriving from the peer.
/// </summary>
public sealed class FakePlcTransport : IPlcTransport
{
    private readonly List<IReadOnlyList<byte>> _sent = [];

    public IReadOnlyList<IReadOnlyList<byte>> Sent => _sent;

    public event Action<ListenerStatus, string?>? StatusChanged;

    public event Action<TrafficEntry>? TrafficObserved;

    public event Action<IReadOnlyList<byte>>? TelegramReceived;

    public Task StartAsync(ListenerConfig config, CancellationToken cancellationToken) => Task.CompletedTask;

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public Task SendAsync(IReadOnlyList<byte> payload, CancellationToken cancellationToken)
    {
        _sent.Add(payload);
        return Task.CompletedTask;
    }

    /// <summary>Simulates a decoded inbound frame arriving from the peer.</summary>
    public void RaiseTelegram(IReadOnlyList<byte> frame) => TelegramReceived?.Invoke(frame);

    // Kept to satisfy analyzers about otherwise-unused events; never invoked in tests.
    public void RaiseStatus(ListenerStatus status, string? detail) => StatusChanged?.Invoke(status, detail);

    public void RaiseTraffic(TrafficEntry entry) => TrafficObserved?.Invoke(entry);
}

using PlcTelegramSimulator.Application.Abstractions;

namespace PlcTelegramSimulator.Infrastructure.IntegrationTests.Fakes;

/// <summary>
/// Test double for <see cref="ISimulationEngine"/> that records the inputs the gateway enqueues.
/// </summary>
public sealed class FakeSimulationEngine : ISimulationEngine
{
    private readonly List<int> _acknowledged = [];
    private readonly List<(int TelegramId, string Destination)> _resolved = [];
    private readonly List<(string Tu, string Mp)> _arrivals = [];

    public IReadOnlyList<int> Acknowledged => _acknowledged;

    public IReadOnlyList<(int TelegramId, string Destination)> Resolved => _resolved;

    public IReadOnlyList<(string Tu, string Mp)> Arrivals => _arrivals;

    public bool TryReportArrival(string transportUnitId, string messagePointId)
    {
        _arrivals.Add((transportUnitId, messagePointId));
        return true;
    }

    public bool TryAcknowledge(int telegramId)
    {
        _acknowledged.Add(telegramId);
        return true;
    }

    public bool TryResolveTransportOrder(int telegramId, string destination)
    {
        _resolved.Add((telegramId, destination));
        return true;
    }
}

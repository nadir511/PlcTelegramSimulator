using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Application.Simulation;

namespace PlcTelegramSimulator.Infrastructure.IntegrationTests.Fakes;

/// <summary>
/// Test double for <see cref="ISimulationEngine"/> that records the inputs the gateway enqueues.
/// </summary>
public sealed class FakeSimulationEngine : ISimulationEngine
{
    private readonly List<int> _acknowledged = [];
    private readonly List<(int TelegramId, string Destination, string? DestinationMp)> _resolved = [];
    private readonly List<(string Tu, string Mp, int? TelegramId, EncodedMpTelegram? Telegram)> _arrivals = [];

    public IReadOnlyList<int> Acknowledged => _acknowledged;

    public IReadOnlyList<(int TelegramId, string Destination, string? DestinationMp)> Resolved => _resolved;

    public IReadOnlyList<(string Tu, string Mp, int? TelegramId, EncodedMpTelegram? Telegram)> Arrivals => _arrivals;

    public bool TryReportArrival(
        string transportUnitId, string messagePointId, int? telegramId, EncodedMpTelegram? telegram)
    {
        _arrivals.Add((transportUnitId, messagePointId, telegramId, telegram));
        return true;
    }

    public bool TryAcknowledge(int telegramId)
    {
        _acknowledged.Add(telegramId);
        return true;
    }

    public bool TryResolveTransportOrder(int telegramId, string destination, string? destinationMp)
    {
        _resolved.Add((telegramId, destination, destinationMp));
        return true;
    }
}

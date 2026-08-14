using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Application.Simulation;

namespace PlcTelegramSimulator.Application.UnitTests.Fakes;

/// <summary>Test double for <see cref="ISimulationEventPublisher"/> recording every pushed event.</summary>
public sealed class FakeSimulationEventPublisher : ISimulationEventPublisher
{
    private readonly List<MpTelegram> _mpReports = [];
    private readonly List<TransportOrder> _transportOrders = [];
    private readonly List<TimedOutRequest> _timeouts = [];

    public IReadOnlyList<MpTelegram> MpReports => _mpReports;

    public IReadOnlyList<TransportOrder> TransportOrders => _transportOrders;

    public IReadOnlyList<TimedOutRequest> Timeouts => _timeouts;

    public Task MpReportedAsync(MpTelegram telegram, CancellationToken cancellationToken)
    {
        _mpReports.Add(telegram);
        return Task.CompletedTask;
    }

    public Task TransportOrderAppliedAsync(TransportOrder order, CancellationToken cancellationToken)
    {
        _transportOrders.Add(order);
        return Task.CompletedTask;
    }

    public Task RequestTimedOutAsync(PendingMpRequest request, MpTimeoutReason reason, CancellationToken cancellationToken)
    {
        _timeouts.Add(new TimedOutRequest(request, reason));
        return Task.CompletedTask;
    }
}

using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Application.Simulation;

namespace PlcTelegramSimulator.Application.UnitTests.Simulation;

public sealed class ReportArrivalCommandHandlerTests
{
    [Fact]
    public async Task Handle_ReturnsAccepted_WhenEngineAcceptsInput()
    {
        var engine = new StubSimulationEngine(accept: true);
        var handler = new ReportArrivalCommandHandler(engine);

        var result = await handler.Handle(new ReportArrivalCommand("TU-1", "MP1"), CancellationToken.None);

        Assert.True(result.Accepted);
        Assert.Equal(("TU-1", "MP1"), engine.LastArrival);
    }

    [Fact]
    public async Task Handle_ReturnsNotAccepted_WhenEngineRejectsInput()
    {
        var engine = new StubSimulationEngine(accept: false);
        var handler = new ReportArrivalCommandHandler(engine);

        var result = await handler.Handle(new ReportArrivalCommand("TU-1", "MP1"), CancellationToken.None);

        Assert.False(result.Accepted);
    }

    private sealed class StubSimulationEngine : ISimulationEngine
    {
        private readonly bool _accept;

        public StubSimulationEngine(bool accept) => _accept = accept;

        public (string Tu, string Mp)? LastArrival { get; private set; }

        public bool TryReportArrival(string transportUnitId, string messagePointId)
        {
            LastArrival = (transportUnitId, messagePointId);
            return _accept;
        }

        public bool TryAcknowledge(int telegramId) => _accept;

        public bool TryResolveTransportOrder(int telegramId, string destination) => _accept;
    }
}

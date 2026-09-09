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

    [Fact]
    public async Task Handle_ThreadsEncodedTelegram_ToEngine()
    {
        var engine = new StubSimulationEngine(accept: true);
        var handler = new ReportArrivalCommandHandler(engine);
        var encoded = new EncodedMpTelegram(new byte[] { 1, 2, 3, 4 });

        await handler.Handle(
            new ReportArrivalCommand("TU-1", "MP1", TelegramId: 42, encoded), CancellationToken.None);

        Assert.Same(encoded, engine.LastTelegram);
        Assert.Equal(42, engine.LastTelegramId);
    }

    [Fact]
    public async Task Handle_WithoutTelegram_ThreadsNull_ToEngine()
    {
        var engine = new StubSimulationEngine(accept: true);
        var handler = new ReportArrivalCommandHandler(engine);

        await handler.Handle(new ReportArrivalCommand("TU-1", "MP1"), CancellationToken.None);

        Assert.Null(engine.LastTelegram);
        Assert.Null(engine.LastTelegramId);
    }

    private sealed class StubSimulationEngine : ISimulationEngine
    {
        private readonly bool _accept;

        public StubSimulationEngine(bool accept) => _accept = accept;

        public (string Tu, string Mp)? LastArrival { get; private set; }

        public int? LastTelegramId { get; private set; }

        public EncodedMpTelegram? LastTelegram { get; private set; }

        public bool TryReportArrival(
            string transportUnitId, string messagePointId, int? telegramId, EncodedMpTelegram? telegram)
        {
            LastArrival = (transportUnitId, messagePointId);
            LastTelegramId = telegramId;
            LastTelegram = telegram;
            return _accept;
        }

        public bool TryAcknowledge(int telegramId) => _accept;

        public bool TryResolveTransportOrder(int telegramId, string destination, string? destinationMp) => _accept;
    }
}

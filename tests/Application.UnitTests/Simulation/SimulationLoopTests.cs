using Microsoft.Extensions.Logging.Abstractions;
using PlcTelegramSimulator.Application.Simulation;
using PlcTelegramSimulator.Application.UnitTests.Fakes;

namespace PlcTelegramSimulator.Application.UnitTests.Simulation;

public sealed class SimulationLoopTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    private static SimulationLoop Build(
        out FakeMpTelegramGateway gateway,
        out FakeSimulationEventPublisher publisher,
        out ManualTimeProvider time,
        MpOrchestratorOptions? orchestratorOptions = null,
        SimulationLoopOptions? loopOptions = null)
    {
        gateway = new FakeMpTelegramGateway();
        publisher = new FakeSimulationEventPublisher();
        time = new ManualTimeProvider(T0);
        var orchestrator = new MpOrchestrator(
            gateway,
            publisher,
            time,
            orchestratorOptions ?? new MpOrchestratorOptions(),
            NullLogger<MpOrchestrator>.Instance);
        return new SimulationLoop(
            orchestrator, loopOptions ?? new SimulationLoopOptions(), NullLogger<SimulationLoop>.Instance);
    }

    [Fact]
    public async Task ProcessAsync_ReportArrival_SendsMpTelegram()
    {
        var loop = Build(out var gateway, out var publisher, out _);

        await loop.ProcessAsync(
            new SimulationInput.ReportArrival("TU-1", "MP1", TelegramId: null, Telegram: null), CancellationToken.None);

        var sent = Assert.Single(gateway.Sent);
        Assert.Equal("TU-1", sent.TransportUnitId);
        Assert.Equal("MP1", sent.MessagePointId);
        Assert.Single(publisher.MpReports);
        Assert.Equal(1, loop.OutstandingCount);
    }

    [Fact]
    public async Task ProcessAsync_ReportArrival_ThreadsEncodedTelegram_OntoGateway()
    {
        var loop = Build(out var gateway, out _, out _);
        var encoded = new EncodedMpTelegram(new byte[] { 1, 2, 3, 4 });

        await loop.ProcessAsync(
            new SimulationInput.ReportArrival("TU-1", "MP1", TelegramId: 77, encoded), CancellationToken.None);

        var sent = Assert.Single(gateway.Sent);
        Assert.Same(encoded, sent.Encoded);
        Assert.Equal(77, sent.TelegramId);
    }

    [Fact]
    public async Task ProcessAsync_AcknowledgeThenResolve_PushesDestination()
    {
        var loop = Build(out var gateway, out var publisher, out _);
        await loop.ProcessAsync(
            new SimulationInput.ReportArrival("TU-1", "MP1", TelegramId: null, Telegram: null), CancellationToken.None);
        var telegramId = gateway.Sent[0].TelegramId;

        await loop.ProcessAsync(new SimulationInput.AcknowledgeReceipt(telegramId), CancellationToken.None);
        await loop.ProcessAsync(
            new SimulationInput.ResolveTransportOrder(telegramId, "DEST-Z", "MP-9"), CancellationToken.None);

        var order = Assert.Single(publisher.TransportOrders);
        Assert.Equal("TU-1", order.TransportUnitId);
        Assert.Equal("DEST-Z", order.Destination);
        Assert.Equal("MP-9", order.DestinationMp);
        Assert.Equal(0, loop.OutstandingCount);
    }

    [Fact]
    public async Task ProcessAsync_SweepTimeouts_FaultsExpiredRequest()
    {
        var options = new MpOrchestratorOptions { AcknowledgementTimeout = TimeSpan.FromSeconds(2) };
        var loop = Build(out _, out var publisher, out var time, options);
        await loop.ProcessAsync(
            new SimulationInput.ReportArrival("TU-1", "MP1", TelegramId: null, Telegram: null), CancellationToken.None);

        time.Advance(TimeSpan.FromSeconds(3));
        await loop.ProcessAsync(new SimulationInput.SweepTimeouts(), CancellationToken.None);

        var timedOut = Assert.Single(publisher.Timeouts);
        Assert.Equal(MpTimeoutReason.Acknowledgement, timedOut.Reason);

        // ADR-0015 "hold": the faulted request is retained until a genuine TO resolves it.
        Assert.Equal(1, loop.OutstandingCount);
    }

    [Fact]
    public void TryReportArrival_BlankArguments_Throw()
    {
        var loop = Build(out _, out _, out _);

        Assert.Throws<ArgumentException>(() => loop.TryReportArrival(" ", "MP1", telegramId: null, telegram: null));
        Assert.Throws<ArgumentException>(() => loop.TryReportArrival("TU-1", " ", telegramId: null, telegram: null));
    }

    [Fact]
    public void TryResolveTransportOrder_BlankDestination_Throws()
    {
        var loop = Build(out _, out _, out _);

        Assert.Throws<ArgumentException>(() => loop.TryResolveTransportOrder(1, " ", null));
    }

    [Fact]
    public async Task StartedLoop_DrainsEnqueuedArrival_OntoGateway()
    {
        var loop = Build(out var gateway, out _, out _);
        await loop.StartAsync(CancellationToken.None);
        try
        {
            Assert.True(loop.TryReportArrival("TU-1", "MP1", telegramId: null, telegram: null));

            await WaitUntilAsync(() => gateway.Sent.Count == 1);
            Assert.Single(gateway.Sent);
        }
        finally
        {
            await loop.StopAsync(CancellationToken.None);
        }
    }

    [Fact]
    public async Task StartedLoop_UnknownAcknowledge_DoesNotFault()
    {
        var loop = Build(out _, out var publisher, out _);
        await loop.StartAsync(CancellationToken.None);
        try
        {
            Assert.True(loop.TryAcknowledge(4242));
            Assert.True(loop.TryResolveTransportOrder(4242, "DEST", null));

            // Give the pump a moment; nothing should have been published.
            await Task.Delay(50);
            Assert.Empty(publisher.TransportOrders);
            Assert.Empty(publisher.Timeouts);
        }
        finally
        {
            await loop.StopAsync(CancellationToken.None);
        }
    }

    private static async Task WaitUntilAsync(Func<bool> condition)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        while (!condition())
        {
            cts.Token.ThrowIfCancellationRequested();
            await Task.Delay(10, cts.Token);
        }
    }
}

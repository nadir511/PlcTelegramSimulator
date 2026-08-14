using PlcTelegramSimulator.Domain.Simulation;

namespace PlcTelegramSimulator.Domain.UnitTests.Simulation;

public sealed class BinRoutingStateTests
{
    [Fact]
    public void Start_BeginsMoving()
    {
        Assert.Equal(BinRoutingStatus.Moving, BinRoutingState.Start().Status);
    }

    [Fact]
    public void HandshakeHappyPath_MovesThroughToRelease()
    {
        var state = BinRoutingState.Start()
            .ArriveAtMessagePoint()
            .AwaitTransportOrder()
            .ApplyTransportOrder()
            .Release();

        Assert.Equal(BinRoutingStatus.Moving, state.Status);
    }

    [Fact]
    public void BlockThenUnblock_ReturnsToMoving()
    {
        var blocked = BinRoutingState.Start().Block();

        Assert.Equal(BinRoutingStatus.Blocked, blocked.Status);
        Assert.Equal(BinRoutingStatus.Moving, blocked.Unblock().Status);
    }

    [Fact]
    public void TransportOrderTimeout_RoutesThroughException()
    {
        var faulted = BinRoutingState.Start()
            .ArriveAtMessagePoint()
            .AwaitTransportOrder()
            .FaultTransportOrder();

        Assert.Equal(BinRoutingStatus.Exception, faulted.Status);
        Assert.Equal(BinRoutingStatus.Routing, faulted.ResolveException().Status);
    }

    [Fact]
    public void Complete_FromMoving_Terminates()
    {
        Assert.Equal(BinRoutingStatus.Completed, BinRoutingState.Start().Complete().Status);
    }

    [Fact]
    public void ApplyTransportOrder_BeforeAwaiting_Throws()
    {
        Assert.Throws<InvalidOperationException>(() => BinRoutingState.Start().ApplyTransportOrder());
    }

    [Fact]
    public void AwaitTransportOrder_BeforeArrivingAtMessagePoint_Throws()
    {
        Assert.Throws<InvalidOperationException>(() => BinRoutingState.Start().AwaitTransportOrder());
    }
}

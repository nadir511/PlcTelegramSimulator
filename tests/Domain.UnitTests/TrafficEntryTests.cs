using PlcTelegramSimulator.Domain;

namespace PlcTelegramSimulator.Domain.UnitTests;

public sealed class TrafficEntryTests
{
    [Fact]
    public void Outbound_SetsLevelPayloadAndLabel()
    {
        var payload = new byte[] { 0x01, 0x02, 0x03 };

        var entry = TrafficEntry.Outbound(payload, "MANUAL");

        Assert.Equal(TrafficLevel.Outbound, entry.Level);
        Assert.Equal(payload, entry.Payload);
        Assert.Equal("MANUAL", entry.Label);
        Assert.Null(entry.Message);
    }

    [Fact]
    public void Inbound_SetsLevelAndPayload()
    {
        var payload = new byte[] { 0x06 };

        var entry = TrafficEntry.Inbound(payload);

        Assert.Equal(TrafficLevel.Inbound, entry.Level);
        Assert.Equal(payload, entry.Payload);
        Assert.Null(entry.Message);
        Assert.Null(entry.Label);
    }

    [Fact]
    public void Error_SetsLevelAndMessage()
    {
        var entry = TrafficEntry.Error("frame too long, discarded");

        Assert.Equal(TrafficLevel.Error, entry.Level);
        Assert.Equal("frame too long, discarded", entry.Message);
        Assert.Null(entry.Payload);
        Assert.Null(entry.Label);
    }

    [Fact]
    public void System_SetsLevelAndMessage()
    {
        var entry = TrafficEntry.System("Listener stopped");

        Assert.Equal(TrafficLevel.System, entry.Level);
        Assert.Equal("Listener stopped", entry.Message);
        Assert.Null(entry.Payload);
    }

    [Fact]
    public void Factories_StampRecentUtcTimestamp()
    {
        var before = DateTimeOffset.UtcNow.AddSeconds(-1);

        var entry = TrafficEntry.System("tick");

        var after = DateTimeOffset.UtcNow.AddSeconds(1);
        Assert.InRange(entry.Timestamp, before, after);
    }

    [Fact]
    public void Factories_AssignUniqueMonotonicIds()
    {
        var first = TrafficEntry.System("a");
        var second = TrafficEntry.Outbound(new byte[] { 0x00 });
        var third = TrafficEntry.Error("c");

        var ids = new[] { first.Id, second.Id, third.Id };

        Assert.Equal(3, ids.Distinct().Count());
        Assert.All(ids, id => Assert.StartsWith("evt-", id));
    }
}

using PlcTelegramSimulator.Domain;

namespace PlcTelegramSimulator.Domain.UnitTests;

public sealed class ListenerConfigTests
{
    [Fact]
    public void Create_WithValidValues_PopulatesProperties()
    {
        var config = ListenerConfig.Create("0.0.0.0", sendPort: 2000, receivePort: 2001, processingDelayMs: 50, autoAcceptReconnections: true);

        Assert.Equal("0.0.0.0", config.BindAddress);
        Assert.Equal(2000, config.SendPort);
        Assert.Equal(2001, config.ReceivePort);
        Assert.Equal(TimeSpan.FromMilliseconds(50), config.ProcessingDelay);
        Assert.True(config.AutoAcceptReconnections);

        // End-of-Telegram defaults to '~' (0x7E, eHub's terminator) to mirror the frontend default.
        Assert.Equal("~", config.EndOfTelegram);
        Assert.Equal(new byte[] { 0x7E }, config.Terminator);
    }

    [Theory]
    [InlineData("~", new byte[] { 0x7E })]
    [InlineData("#!", new byte[] { 0x23, 0x21 })]
    public void Create_WithExplicitEndOfTelegram_EncodesTerminatorBytes(string endOfTelegram, byte[] expected)
    {
        var config = ListenerConfig.Create(
            "127.0.0.1", sendPort: 2000, receivePort: 2001, processingDelayMs: 0, autoAcceptReconnections: false, endOfTelegram);

        Assert.Equal(endOfTelegram, config.EndOfTelegram);
        Assert.Equal(expected, config.Terminator);
    }

    [Theory]
    [InlineData("")]
    [InlineData("123456789")] // 9 chars, exceeds MaxEndOfTelegramLength
    [InlineData("€")] // multi-byte, not Latin-1
    public void Create_WithInvalidEndOfTelegram_ThrowsWithEndOfTelegramKey(string endOfTelegram)
    {
        var ex = Assert.Throws<DomainValidationException>(() =>
            ListenerConfig.Create("127.0.0.1", sendPort: 2000, receivePort: 2001, processingDelayMs: 0, autoAcceptReconnections: false, endOfTelegram));

        Assert.Contains("endOfTelegram", ex.Errors.Keys);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(70000)]
    [InlineData(65536)]
    public void Create_WithSendPortOutOfRange_ThrowsWithSendPortKey(int sendPort)
    {
        var ex = Assert.Throws<DomainValidationException>(() =>
            ListenerConfig.Create("127.0.0.1", sendPort, receivePort: 2001, processingDelayMs: 0, autoAcceptReconnections: false));

        Assert.Contains("sendPort", ex.Errors.Keys);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(70000)]
    public void Create_WithReceivePortOutOfRange_ThrowsWithReceivePortKey(int receivePort)
    {
        var ex = Assert.Throws<DomainValidationException>(() =>
            ListenerConfig.Create("127.0.0.1", sendPort: 2000, receivePort, processingDelayMs: 0, autoAcceptReconnections: false));

        Assert.Contains("receivePort", ex.Errors.Keys);
    }

    [Fact]
    public void Create_WithEqualPorts_ThrowsWithReceivePortKey()
    {
        var ex = Assert.Throws<DomainValidationException>(() =>
            ListenerConfig.Create("127.0.0.1", sendPort: 2000, receivePort: 2000, processingDelayMs: 0, autoAcceptReconnections: false));

        Assert.Contains("receivePort", ex.Errors.Keys);
        Assert.Equal("Send and receive ports must be different.", ex.Errors["receivePort"]);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-an-ip")]
    [InlineData("999.999.999.999")]
    public void Create_WithInvalidBindAddress_ThrowsWithBindAddressKey(string bindAddress)
    {
        var ex = Assert.Throws<DomainValidationException>(() =>
            ListenerConfig.Create(bindAddress, sendPort: 2000, receivePort: 2001, processingDelayMs: 0, autoAcceptReconnections: false));

        Assert.Contains("bindAddress", ex.Errors.Keys);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(60001)]
    public void Create_WithProcessingDelayOutOfRange_ThrowsWithProcessingDelayKey(int delayMs)
    {
        var ex = Assert.Throws<DomainValidationException>(() =>
            ListenerConfig.Create("127.0.0.1", sendPort: 2000, receivePort: 2001, processingDelayMs: delayMs, autoAcceptReconnections: false));

        Assert.Contains("processingDelayMs", ex.Errors.Keys);
    }

    [Fact]
    public void Create_WithMultipleInvalidFields_AggregatesAllErrors()
    {
        var ex = Assert.Throws<DomainValidationException>(() =>
            ListenerConfig.Create("", sendPort: 0, receivePort: 70000, processingDelayMs: -5, autoAcceptReconnections: false));

        Assert.Contains("bindAddress", ex.Errors.Keys);
        Assert.Contains("sendPort", ex.Errors.Keys);
        Assert.Contains("receivePort", ex.Errors.Keys);
        Assert.Contains("processingDelayMs", ex.Errors.Keys);
    }

    [Fact]
    public void Create_WithZeroProcessingDelay_IsValid()
    {
        var config = ListenerConfig.Create("127.0.0.1", sendPort: 2000, receivePort: 2001, processingDelayMs: 0, autoAcceptReconnections: false);

        Assert.Equal(TimeSpan.Zero, config.ProcessingDelay);
    }
}

namespace PlcTelegramSimulator.Application.UnitTests.Fakes;

/// <summary>A <see cref="TimeProvider"/> whose UTC clock only moves when a test advances it.</summary>
public sealed class ManualTimeProvider : TimeProvider
{
    private DateTimeOffset _utcNow;

    public ManualTimeProvider(DateTimeOffset start) => _utcNow = start;

    public override DateTimeOffset GetUtcNow() => _utcNow;

    public void Advance(TimeSpan by) => _utcNow += by;
}

namespace PlcTelegramSimulator.Infrastructure.Transport.Simulation;

/// <summary>
/// Wire-format options for <see cref="SimulationTelegramCodec"/> (ADR-0015). These live in
/// Infrastructure because they are cosmetic wire concerns: the <c>TelegramId</c> stays an
/// <see cref="int"/> throughout the domain and application layers, and only its on-the-wire
/// rendering is padded here.
/// </summary>
public sealed record SimulationCodecOptions
{
    /// <summary>
    /// Zero-pad width for the outbound <c>TelegramId</c> (e.g. width 6 renders <c>1</c> as
    /// <c>000001</c>). A value of zero or less emits the plain number. Defaults to 6.
    /// </summary>
    public int TelegramIdWidth { get; init; } = 6;
}

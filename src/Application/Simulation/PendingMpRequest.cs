namespace PlcTelegramSimulator.Application.Simulation;

/// <summary>
/// A message-point report awaiting its transport order, tracked in the
/// <see cref="PendingRequestRegistry"/> keyed by <see cref="TelegramId"/> (ADR-0012). Immutable:
/// phase changes produce a new instance.
/// </summary>
/// <param name="TelegramId">Correlation key shared by the MP report and its transport order.</param>
/// <param name="TransportUnitId">The bin awaiting a destination.</param>
/// <param name="MessagePointId">The message point that reported the arrival.</param>
/// <param name="Phase">Where the request sits in the two-phase lifecycle.</param>
/// <param name="SentAt">When the MP telegram was sent (drives the ACK timeout).</param>
/// <param name="AcknowledgedAt">When the ACK arrived, if it has (drives the TO timeout).</param>
public sealed record PendingMpRequest(
    int TelegramId,
    string TransportUnitId,
    string MessagePointId,
    MpRequestPhase Phase,
    DateTimeOffset SentAt,
    DateTimeOffset? AcknowledgedAt)
{
    /// <summary>Creates a freshly-sent request in the <see cref="MpRequestPhase.PendingAck"/> phase.</summary>
    public static PendingMpRequest Create(MpTelegram telegram, DateTimeOffset sentAt)
    {
        ArgumentNullException.ThrowIfNull(telegram);

        return new PendingMpRequest(
            telegram.TelegramId,
            telegram.TransportUnitId,
            telegram.MessagePointId,
            MpRequestPhase.PendingAck,
            sentAt,
            AcknowledgedAt: null);
    }

    /// <summary>Transitions to <see cref="MpRequestPhase.Acknowledged"/>, stamping the ACK time.</summary>
    public PendingMpRequest Acknowledge(DateTimeOffset acknowledgedAt) =>
        this with { Phase = MpRequestPhase.Acknowledged, AcknowledgedAt = acknowledgedAt };
}

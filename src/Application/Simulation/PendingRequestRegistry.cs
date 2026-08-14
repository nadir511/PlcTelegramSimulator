namespace PlcTelegramSimulator.Application.Simulation;

/// <summary>
/// The Pending-Request Registry (ADR-0012): maps <c>TelegramId → PendingMpRequest</c> so an
/// out-of-order transport order can be paired with its originating MP report. Because a bin blocks
/// at its message point, each transport unit has <b>at most one</b> outstanding request. This type
/// is <b>not</b> thread-safe by design: it is owned and mutated only by the single-writer
/// simulation loop.
/// </summary>
public sealed class PendingRequestRegistry
{
    private readonly Dictionary<int, PendingMpRequest> _byTelegramId = [];

    /// <summary>The number of requests currently awaiting an ACK or TO.</summary>
    public int Count => _byTelegramId.Count;

    /// <summary>Registers a freshly-sent request.</summary>
    /// <exception cref="InvalidOperationException">A request with the same TelegramId is already outstanding.</exception>
    public void Register(PendingMpRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!_byTelegramId.TryAdd(request.TelegramId, request))
        {
            throw new InvalidOperationException(
                $"A request with TelegramId {request.TelegramId} is already outstanding.");
        }
    }

    /// <summary>Whether the given transport unit already has an outstanding request.</summary>
    public bool HasOutstandingFor(string transportUnitId) =>
        _byTelegramId.Values.Any(request => request.TransportUnitId == transportUnitId);

    /// <summary>
    /// Moves a <see cref="MpRequestPhase.PendingAck"/> request to
    /// <see cref="MpRequestPhase.Acknowledged"/>. Returns <see langword="false"/> for an unknown
    /// TelegramId (a late/duplicate ACK), which the caller ignores idempotently.
    /// </summary>
    public bool TryAcknowledge(int telegramId, DateTimeOffset acknowledgedAt)
    {
        if (!_byTelegramId.TryGetValue(telegramId, out var request))
        {
            return false;
        }

        _byTelegramId[telegramId] = request.Acknowledge(acknowledgedAt);
        return true;
    }

    /// <summary>
    /// Removes and returns the request matching <paramref name="telegramId"/> (its phase set to
    /// <see cref="MpRequestPhase.Resolved"/>), or <see langword="null"/> when it is unknown (an
    /// unmatched / duplicate / late TO).
    /// </summary>
    public PendingMpRequest? Resolve(int telegramId) =>
        _byTelegramId.Remove(telegramId, out var request)
            ? request with { Phase = MpRequestPhase.Resolved }
            : null;

    /// <summary>
    /// Removes and returns every request whose ACK or TO deadline has passed at
    /// <paramref name="now"/>. A <see cref="MpRequestPhase.PendingAck"/> request expires
    /// <paramref name="ackTimeout"/> after it was sent; an <see cref="MpRequestPhase.Acknowledged"/>
    /// request expires <paramref name="transportOrderTimeout"/> after it was acknowledged.
    /// </summary>
    public IReadOnlyList<TimedOutRequest> CollectExpired(
        DateTimeOffset now, TimeSpan ackTimeout, TimeSpan transportOrderTimeout)
    {
        List<TimedOutRequest>? expired = null;

        foreach (var request in _byTelegramId.Values)
        {
            if (ExpiryReason(request, now, ackTimeout, transportOrderTimeout) is { } reason)
            {
                (expired ??= []).Add(new TimedOutRequest(request, reason));
            }
        }

        if (expired is null)
        {
            return [];
        }

        foreach (var timedOut in expired)
        {
            _byTelegramId.Remove(timedOut.Request.TelegramId);
        }

        return expired;
    }

    private static MpTimeoutReason? ExpiryReason(
        PendingMpRequest request, DateTimeOffset now, TimeSpan ackTimeout, TimeSpan transportOrderTimeout) =>
        request.Phase switch
        {
            MpRequestPhase.PendingAck when now - request.SentAt >= ackTimeout =>
                MpTimeoutReason.Acknowledgement,
            MpRequestPhase.Acknowledged when now - (request.AcknowledgedAt ?? request.SentAt) >= transportOrderTimeout =>
                MpTimeoutReason.TransportOrder,
            _ => null,
        };
}

/// <summary>A request removed by <see cref="PendingRequestRegistry.CollectExpired"/> and the reason.</summary>
/// <param name="Request">The request that timed out.</param>
/// <param name="Reason">Whether the ACK or the TO deadline was missed.</param>
public sealed record TimedOutRequest(PendingMpRequest Request, MpTimeoutReason Reason);

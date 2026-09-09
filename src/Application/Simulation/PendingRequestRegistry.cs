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

    /// <summary>
    /// Registers a freshly-sent request under its <c>TelegramId</c>. Since ADR-0009 the frontend
    /// mints the id, and it is strictly monotonic <b>within a run</b> (a bin also blocks at its MP,
    /// so each transport unit has at most one outstanding request). A collision can therefore only be
    /// a <b>stale entry left over from a previous run</b>: the canvas resets its id sequence on
    /// stop/reload, whereas this process-lifetime registry keeps held/faulted requests (ADR-0015).
    /// Such a stale request is <b>superseded</b> — evicted and returned so the caller can observe it —
    /// and the fresh request takes its place. This keeps the correlation authority live across
    /// restarts instead of throwing and stranding the new arrival.
    /// </summary>
    /// <returns>The superseded stale request, or <see langword="null"/> when the id was free.</returns>
    public PendingMpRequest? Register(PendingMpRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        _byTelegramId.Remove(request.TelegramId, out var superseded);
        _byTelegramId[request.TelegramId] = request;
        return superseded;
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
    /// Reports every request whose ACK or TO deadline has passed at <paramref name="now"/> as a
    /// <see cref="TimedOutRequest"/>, <b>retaining</b> each one (ADR-0015 "hold" exception policy). A
    /// <see cref="MpRequestPhase.PendingAck"/> request expires <paramref name="ackTimeout"/> after it
    /// was sent; an <see cref="MpRequestPhase.Acknowledged"/> request expires
    /// <paramref name="transportOrderTimeout"/> after it was acknowledged. The faulted request is
    /// marked <see cref="PendingMpRequest.Faulted"/> so it surfaces <b>at most once</b>; it stays in
    /// the registry so a late/out-of-order transport order can still <see cref="Resolve"/> it and
    /// release the bin, rather than being stranded as "unmatched".
    /// </summary>
    public IReadOnlyList<TimedOutRequest> CollectExpired(
        DateTimeOffset now, TimeSpan ackTimeout, TimeSpan transportOrderTimeout)
    {
        List<TimedOutRequest>? expired = null;

        foreach (var request in _byTelegramId.Values)
        {
            if (!request.Faulted &&
                ExpiryReason(request, now, ackTimeout, transportOrderTimeout) is { } reason)
            {
                (expired ??= []).Add(new TimedOutRequest(request, reason));
            }
        }

        if (expired is null)
        {
            return [];
        }

        // Mark faulted but keep the request: a genuine TO arriving later still resolves the bin.
        foreach (var timedOut in expired)
        {
            _byTelegramId[timedOut.Request.TelegramId] = timedOut.Request with { Faulted = true };
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

/// <summary>A request whose deadline lapsed in <see cref="PendingRequestRegistry.CollectExpired"/> and the reason.</summary>
/// <param name="Request">The request that timed out (retained in the registry per the ADR-0015 hold policy).</param>
/// <param name="Reason">Whether the ACK or the TO deadline was missed.</param>
public sealed record TimedOutRequest(PendingMpRequest Request, MpTimeoutReason Reason);

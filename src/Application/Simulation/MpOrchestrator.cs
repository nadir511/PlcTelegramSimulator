using Microsoft.Extensions.Logging;
using PlcTelegramSimulator.Application.Abstractions;

namespace PlcTelegramSimulator.Application.Simulation;

/// <summary>
/// Correlates message-point reports with their transport orders (ADR-0012, "Concern 1"). When a bin
/// reaches an MP it sends an MP telegram (Status N) through <see cref="IMpTelegramGateway"/> and
/// records a <see cref="PendingMpRequest"/> in the <see cref="PendingRequestRegistry"/>. Inbound
/// ACK/TO are matched by <c>TelegramId</c>, tolerating out-of-order, duplicate, and late arrivals.
/// Timeouts are swept by <see cref="CheckTimeoutsAsync"/>.
/// <para>
/// All methods run on the <b>single-writer</b> simulation loop (ADR-0012): they are never invoked
/// concurrently, so the registry and the correlation counter need no locking.
/// </para>
/// </summary>
public sealed class MpOrchestrator
{
    private readonly IMpTelegramGateway _gateway;
    private readonly ISimulationEventPublisher _publisher;
    private readonly TimeProvider _timeProvider;
    private readonly MpOrchestratorOptions _options;
    private readonly ILogger<MpOrchestrator> _logger;
    private readonly PendingRequestRegistry _registry = new();

    private int _lastTelegramId;

    public MpOrchestrator(
        IMpTelegramGateway gateway,
        ISimulationEventPublisher publisher,
        TimeProvider timeProvider,
        MpOrchestratorOptions options,
        ILogger<MpOrchestrator> logger)
    {
        _gateway = gateway;
        _publisher = publisher;
        _timeProvider = timeProvider;
        _options = options;
        _logger = logger;
    }

    /// <summary>The number of requests currently awaiting an ACK or TO.</summary>
    public int OutstandingCount => _registry.Count;

    /// <summary>
    /// Reports that <paramref name="transportUnitId"/> reached <paramref name="messagePointId"/>:
    /// uses the frontend-minted <paramref name="telegramId"/> as the correlation key (or allocates one
    /// when none is supplied, ADR-0009), registers the pending request, sends the MP telegram, and
    /// notifies the canvas. Idempotent per bin — because a bin blocks at its MP it has at most one
    /// outstanding request, so a repeat arrival is ignored and returns <see langword="null"/>.
    /// </summary>
    /// <returns>
    /// The correlation <c>TelegramId</c>, or <see langword="null"/> if the bin already has an
    /// outstanding request.
    /// </returns>
    public async Task<int?> ReportArrivalAsync(
        string transportUnitId,
        string messagePointId,
        int? telegramId,
        EncodedMpTelegram? telegram,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(transportUnitId);
        ArgumentException.ThrowIfNullOrWhiteSpace(messagePointId);

        if (_registry.HasOutstandingFor(transportUnitId))
        {
            _logger.LogDebug(
                "Ignoring repeat MP arrival for {TransportUnitId} at {MessagePointId}; a request is already outstanding.",
                transportUnitId, messagePointId);
            return null;
        }

        var mpTelegram = new MpTelegram(
            telegramId ?? NextTelegramId(), transportUnitId, messagePointId, telegram);
        var superseded = _registry.Register(PendingMpRequest.Create(mpTelegram, _timeProvider.GetUtcNow()));
        if (superseded is not null)
        {
            // ADR-0009: the frontend mints ids and resets its sequence per run, while this registry
            // holds faulted requests across runs (ADR-0015). A reused id is a stale prior-run entry;
            // superseding it keeps the new arrival correlatable instead of dropping it.
            _logger.LogWarning(
                "Superseded a stale request for TelegramId {TelegramId} (previous transport unit {PreviousTransportUnitId}); "
                    + "the id was reused, most likely after a simulation restart.",
                superseded.TelegramId, superseded.TransportUnitId);
        }

        await _gateway.SendAsync(mpTelegram, cancellationToken);
        await _publisher.MpReportedAsync(mpTelegram, cancellationToken);

        return mpTelegram.TelegramId;
    }

    /// <summary>Records the transport ACK (Status A) for a request; ignores an unknown/duplicate ACK.</summary>
    public void Acknowledge(int telegramId)
    {
        if (!_registry.TryAcknowledge(telegramId, _timeProvider.GetUtcNow()))
        {
            _logger.LogWarning("Received ACK for unknown or already-resolved TelegramId {TelegramId}.", telegramId);
        }
    }

    /// <summary>
    /// Applies an inbound transport order to its originating request (matched by
    /// <paramref name="telegramId"/>) and pushes the destination to the canvas. An unmatched,
    /// duplicate, or late TO is ignored idempotently. A request that already faulted on timeout is
    /// still resolvable (ADR-0015 "hold"), so a genuine late TO releases the held bin.
    /// </summary>
    /// <param name="telegramId">Correlation key of the originating MP request.</param>
    /// <param name="destination">The next destination the bin should route toward.</param>
    /// <param name="destinationMp">The next message point id, when the order supplies it; otherwise <see langword="null"/>.</param>
    /// <param name="cancellationToken">Cancels the canvas notification.</param>
    public async Task ResolveAsync(
        int telegramId, string destination, string? destinationMp, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(destination);

        var request = _registry.Resolve(telegramId);
        if (request is null)
        {
            _logger.LogWarning(
                "Received transport order for unmatched/duplicate/late TelegramId {TelegramId}.", telegramId);
            return;
        }

        var order = new TransportOrder(
            telegramId, request.TransportUnitId, request.MessagePointId, destination, destinationMp);
        await _publisher.TransportOrderAppliedAsync(order, cancellationToken);
    }

    /// <summary>
    /// Sweeps expired requests (missing ACK or TO) and surfaces each as a fault. Faulted requests are
    /// <b>retained</b> in the registry (ADR-0015 "hold"), so a late transport order can still resolve
    /// the bin; the registry marks each request so it faults at most once.
    /// </summary>
    public async Task CheckTimeoutsAsync(CancellationToken cancellationToken)
    {
        var expired = _registry.CollectExpired(
            _timeProvider.GetUtcNow(), _options.AcknowledgementTimeout, _options.TransportOrderTimeout);

        foreach (var timedOut in expired)
        {
            _logger.LogWarning(
                "Request {TelegramId} for {TransportUnitId} timed out awaiting {Reason}.",
                timedOut.Request.TelegramId, timedOut.Request.TransportUnitId, timedOut.Reason);
            await _publisher.RequestTimedOutAsync(timedOut.Request, timedOut.Reason, cancellationToken);
        }
    }

    private int NextTelegramId() => ++_lastTelegramId;
}

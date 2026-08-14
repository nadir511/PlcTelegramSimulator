using PlcTelegramSimulator.Application.Simulation;

namespace PlcTelegramSimulator.Application.Abstractions;

/// <summary>
/// Port for pushing MP/TO simulation events to the canvas over the real-time channel (ADR-0012).
/// Implemented by the Web SignalR adapter. Kept in Application so the orchestrator can broadcast
/// without depending on ASP.NET.
/// </summary>
public interface ISimulationEventPublisher
{
    /// <summary>A bin reached a message point and its MP telegram was sent (the bin now awaits a TO).</summary>
    Task MpReportedAsync(MpTelegram telegram, CancellationToken cancellationToken);

    /// <summary>A transport order resolved; the canvas applies the destination and releases the bin.</summary>
    Task TransportOrderAppliedAsync(TransportOrder order, CancellationToken cancellationToken);

    /// <summary>A pending request timed out (missing ACK or TO); the canvas surfaces the fault.</summary>
    Task RequestTimedOutAsync(PendingMpRequest request, MpTimeoutReason reason, CancellationToken cancellationToken);
}

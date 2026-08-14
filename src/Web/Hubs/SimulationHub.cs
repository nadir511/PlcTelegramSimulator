using Microsoft.AspNetCore.SignalR;
using PlcTelegramSimulator.Web.Contracts;

namespace PlcTelegramSimulator.Web.Hubs;

/// <summary>
/// Real-time channel for the Conveyor Simulation Canvas (ADR-0012). Pushes three server→client
/// messages so the thin React renderer can draw authoritative MP/TO state:
/// <list type="bullet">
///   <item><description><c>mpReported</c> (a <see cref="MpReportedDto"/>) — a bin reached a message
///   point and now awaits a transport order;</description></item>
///   <item><description><c>transportOrder</c> (a <see cref="TransportOrderDto"/>) — a destination
///   resolved; the bin may be released;</description></item>
///   <item><description><c>fault</c> (a <see cref="SimulationFaultDto"/>) — a pending request timed
///   out (missing ACK or TO).</description></item>
/// </list>
/// The simulation is transient, so there is no connect-time snapshot; clients observe events from the
/// moment they subscribe.
/// </summary>
public sealed class SimulationHub : Hub
{
    /// <summary>Server→client method name for message-point reports.</summary>
    public const string MpReportedMethod = "mpReported";

    /// <summary>Server→client method name for resolved transport orders.</summary>
    public const string TransportOrderMethod = "transportOrder";

    /// <summary>Server→client method name for pending-request faults (timeouts).</summary>
    public const string FaultMethod = "fault";
}

using Microsoft.AspNetCore.SignalR;
using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Application.Simulation;
using PlcTelegramSimulator.Web.Contracts;
using PlcTelegramSimulator.Web.Hubs;

namespace PlcTelegramSimulator.Web.RealTime;

/// <summary>
/// SignalR adapter for <see cref="ISimulationEventPublisher"/> (ADR-0012). Pushes MP/TO events out to
/// all connected canvas clients via <see cref="SimulationHub"/>, mapping application types to wire
/// DTOs at the boundary. Mirrors <see cref="SignalRConnectionBroadcaster"/>.
/// </summary>
public sealed class SignalRSimulationEventPublisher : ISimulationEventPublisher
{
    private readonly IHubContext<SimulationHub> _hub;

    public SignalRSimulationEventPublisher(IHubContext<SimulationHub> hub) => _hub = hub;

    public Task MpReportedAsync(MpTelegram telegram, CancellationToken cancellationToken) =>
        _hub.Clients.All.SendAsync(
            SimulationHub.MpReportedMethod,
            SimulationContractMapper.ToDto(telegram),
            cancellationToken);

    public Task TransportOrderAppliedAsync(TransportOrder order, CancellationToken cancellationToken) =>
        _hub.Clients.All.SendAsync(
            SimulationHub.TransportOrderMethod,
            SimulationContractMapper.ToDto(order),
            cancellationToken);

    public Task RequestTimedOutAsync(
        PendingMpRequest request, MpTimeoutReason reason, CancellationToken cancellationToken) =>
        _hub.Clients.All.SendAsync(
            SimulationHub.FaultMethod,
            SimulationContractMapper.ToDto(request, reason),
            cancellationToken);
}

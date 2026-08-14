using Microsoft.AspNetCore.SignalR;
using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Domain;
using PlcTelegramSimulator.Web.Contracts;
using PlcTelegramSimulator.Web.Hubs;

namespace PlcTelegramSimulator.Web.RealTime;

/// <summary>
/// SignalR adapter for <see cref="IConnectionBroadcaster"/>. Fans status and
/// traffic events out to all connected clients via <see cref="ConnectionHub"/>,
/// mapping domain values to wire DTOs at the boundary.
/// </summary>
public sealed class SignalRConnectionBroadcaster : IConnectionBroadcaster
{
    private readonly IHubContext<ConnectionHub> _hub;

    public SignalRConnectionBroadcaster(IHubContext<ConnectionHub> hub) => _hub = hub;

    public Task StatusAsync(ListenerStatus status, string? error, CancellationToken cancellationToken) =>
        _hub.Clients.All.SendAsync(
            ConnectionHub.StatusMethod,
            ContractMapper.ToDto(status, error),
            cancellationToken);

    public Task TrafficAsync(TrafficEntry entry, CancellationToken cancellationToken) =>
        _hub.Clients.All.SendAsync(
            ConnectionHub.TrafficMethod,
            ContractMapper.ToDto(entry),
            cancellationToken);
}

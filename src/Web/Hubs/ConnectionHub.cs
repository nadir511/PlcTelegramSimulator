using Microsoft.AspNetCore.SignalR;
using PlcTelegramSimulator.Application.Connection;
using PlcTelegramSimulator.Application.Messaging;
using PlcTelegramSimulator.Web.Contracts;

namespace PlcTelegramSimulator.Web.Hubs;

/// <summary>
/// Real-time channel for the Connection &amp; Session screen. Pushes two
/// server→client messages: <c>status</c> (a <see cref="ConnectionStatusDto"/>)
/// and <c>traffic</c> (a <see cref="TrafficEntryDto"/>). On connect the caller
/// receives the current status snapshot so late joiners are immediately in sync.
/// </summary>
public sealed class ConnectionHub : Hub
{
    /// <summary>Server→client method name for status snapshots.</summary>
    public const string StatusMethod = "status";

    /// <summary>Server→client method name for traffic rows.</summary>
    public const string TrafficMethod = "traffic";

    private readonly ISender _sender;

    public ConnectionHub(ISender sender) => _sender = sender;

    public override async Task OnConnectedAsync()
    {
        var snapshot = await _sender.Send(new GetStatusQuery(), Context.ConnectionAborted);
        await Clients.Caller.SendAsync(StatusMethod, ContractMapper.ToDto(snapshot), Context.ConnectionAborted);
        await base.OnConnectedAsync();
    }
}

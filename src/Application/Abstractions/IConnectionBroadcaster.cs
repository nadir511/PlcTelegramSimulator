using PlcTelegramSimulator.Domain;

namespace PlcTelegramSimulator.Application.Abstractions;

/// <summary>
/// Port for fanning connection updates out to the real-time channel. Implemented
/// by the Web SignalR adapter. Kept in Application so <see cref="Connection.ConnectionState"/>
/// can broadcast without depending on ASP.NET.
/// </summary>
public interface IConnectionBroadcaster
{
    Task StatusAsync(ListenerStatus status, string? error, CancellationToken cancellationToken);

    Task TrafficAsync(TrafficEntry entry, CancellationToken cancellationToken);
}

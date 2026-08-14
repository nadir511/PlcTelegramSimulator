using PlcTelegramSimulator.Application.Messaging;

namespace PlcTelegramSimulator.Application.Connection;

/// <summary>Reads the current listener status snapshot.</summary>
public sealed record GetStatusQuery() : IRequest<ConnectionSnapshot>;

internal sealed class GetStatusQueryHandler(ConnectionState state)
    : IRequestHandler<GetStatusQuery, ConnectionSnapshot>
{
    public Task<ConnectionSnapshot> Handle(GetStatusQuery request, CancellationToken cancellationToken) =>
        Task.FromResult(state.Snapshot());
}

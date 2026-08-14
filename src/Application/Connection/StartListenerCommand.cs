using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Application.Messaging;
using PlcTelegramSimulator.Domain;

namespace PlcTelegramSimulator.Application.Connection;

/// <summary>Starts (binds) the simulated PLC listener with the given config.</summary>
public sealed record StartListenerCommand(ListenerConfig Config) : IRequest<ConnectionSnapshot>;

internal sealed class StartListenerCommandHandler(IPlcTransport transport, ConnectionState state)
    : IRequestHandler<StartListenerCommand, ConnectionSnapshot>
{
    public async Task<ConnectionSnapshot> Handle(StartListenerCommand request, CancellationToken cancellationToken)
    {
        await transport.StartAsync(request.Config, cancellationToken);
        return state.Snapshot();
    }
}

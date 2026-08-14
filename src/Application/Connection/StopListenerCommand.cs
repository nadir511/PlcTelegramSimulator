using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Application.Messaging;

namespace PlcTelegramSimulator.Application.Connection;

/// <summary>Stops the simulated PLC listener. Safe to call when already stopped.</summary>
public sealed record StopListenerCommand() : IRequest<ConnectionSnapshot>;

internal sealed class StopListenerCommandHandler(IPlcTransport transport, ConnectionState state)
    : IRequestHandler<StopListenerCommand, ConnectionSnapshot>
{
    public async Task<ConnectionSnapshot> Handle(StopListenerCommand request, CancellationToken cancellationToken)
    {
        await transport.StopAsync(cancellationToken);
        return state.Snapshot();
    }
}

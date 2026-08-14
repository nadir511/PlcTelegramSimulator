using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Application.Messaging;
using PlcTelegramSimulator.Domain;

namespace PlcTelegramSimulator.Application.Connection;

/// <summary>Sends a manual outbound telegram to the connected peer.</summary>
public sealed record SendTelegramCommand(IReadOnlyList<byte> Payload) : IRequest<SendResult>;

internal sealed class SendTelegramCommandHandler(IPlcTransport transport, ConnectionState state)
    : IRequestHandler<SendTelegramCommand, SendResult>
{
    public async Task<SendResult> Handle(SendTelegramCommand request, CancellationToken cancellationToken)
    {
        // Coarse connectivity check (ADR-accepted): a manual send only makes sense
        // while a peer is connected; the transport still emits a "no client" system
        // event when its send socket has no peer.
        var peerConnected = state.Snapshot().Status == ListenerStatus.Connected;
        await transport.SendAsync(request.Payload, cancellationToken);
        return new SendResult(peerConnected);
    }
}

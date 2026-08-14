namespace PlcTelegramSimulator.Application.Messaging;

/// <summary>
/// Handles a single <typeparamref name="TRequest"/> and returns its
/// <typeparamref name="TResponse"/>. One handler per request type.
/// </summary>
public interface IRequestHandler<in TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    Task<TResponse> Handle(TRequest request, CancellationToken cancellationToken);
}

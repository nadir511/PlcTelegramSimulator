namespace PlcTelegramSimulator.Application.Messaging;

/// <summary>
/// Dispatches a request to its registered <see cref="IRequestHandler{TRequest,TResponse}"/>.
/// Keeps controllers and hubs thin (CQRS-lite mediator, ADR-0005).
/// </summary>
public interface ISender
{
    Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken);
}

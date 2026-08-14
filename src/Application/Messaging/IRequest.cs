namespace PlcTelegramSimulator.Application.Messaging;

/// <summary>
/// Marker for a request (command or query) that is dispatched through
/// <see cref="ISender"/> and produces a <typeparamref name="TResponse"/>.
/// </summary>
/// <typeparam name="TResponse">The response the handler returns.</typeparam>
public interface IRequest<out TResponse>
{
}

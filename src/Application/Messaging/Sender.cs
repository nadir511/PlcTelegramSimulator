using System.Collections.Concurrent;
using System.Reflection;

namespace PlcTelegramSimulator.Application.Messaging;

/// <summary>
/// Lightweight in-house mediator (ADR-0005 permits an in-house dispatcher instead
/// of MediatR). Resolves the closed <see cref="IRequestHandler{TRequest,TResponse}"/>
/// for a request from the ambient <see cref="IServiceProvider"/> and invokes it. The
/// per-handler <c>Handle</c> <see cref="MethodInfo"/> is cached to keep dispatch cheap.
/// </summary>
public sealed class Sender : ISender
{
    private static readonly ConcurrentDictionary<Type, MethodInfo> HandleMethods = new();

    private readonly IServiceProvider _provider;

    public Sender(IServiceProvider provider) => _provider = provider;

    public Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var handlerType = typeof(IRequestHandler<,>).MakeGenericType(request.GetType(), typeof(TResponse));
        var handler = _provider.GetService(handlerType)
            ?? throw new InvalidOperationException(
                $"No handler registered for request type '{request.GetType().Name}'.");

        var handle = HandleMethods.GetOrAdd(handlerType, static type => type.GetMethod("Handle")!);

        return (Task<TResponse>)handle.Invoke(handler, [request, cancellationToken])!;
    }
}

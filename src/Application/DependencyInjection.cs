using Microsoft.Extensions.DependencyInjection;
using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Application.Connection;
using PlcTelegramSimulator.Application.Messaging;
using PlcTelegramSimulator.Application.Simulation;

namespace PlcTelegramSimulator.Application;

/// <summary>Composition helpers for the Application layer (mediator, handlers, state).</summary>
public static class DependencyInjection
{
    /// <summary>
    /// Registers the in-house mediator, all request handlers, the singleton
    /// <see cref="ConnectionState"/>, and the single-writer <see cref="SimulationLoop"/> (both also
    /// hosted so they subscribe/drain on start).
    /// </summary>
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<ISender, Sender>();

        services.AddScoped<IRequestHandler<StartListenerCommand, ConnectionSnapshot>, StartListenerCommandHandler>();
        services.AddScoped<IRequestHandler<StopListenerCommand, ConnectionSnapshot>, StopListenerCommandHandler>();
        services.AddScoped<IRequestHandler<SendTelegramCommand, SendResult>, SendTelegramCommandHandler>();
        services.AddScoped<IRequestHandler<GetStatusQuery, ConnectionSnapshot>, GetStatusQueryHandler>();
        services.AddScoped<IRequestHandler<ReportArrivalCommand, ArrivalAccepted>, ReportArrivalCommandHandler>();

        // Single instance shared as both the state holder and the hosted subscriber.
        services.AddSingleton<ConnectionState>();
        services.AddHostedService(sp => sp.GetRequiredService<ConnectionState>());

        // Backend-authoritative MP/TO orchestration (ADR-0012). The orchestrator is mutated only by
        // the SimulationLoop's single reader; the gateway (IMpTelegramGateway) is composed from
        // Infrastructure. One SimulationLoop instance serves as the engine and the hosted drain.
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton(new MpOrchestratorOptions());
        services.AddSingleton(new SimulationLoopOptions());
        services.AddSingleton<MpOrchestrator>();
        services.AddSingleton<SimulationLoop>();
        services.AddSingleton<ISimulationEngine>(sp => sp.GetRequiredService<SimulationLoop>());
        services.AddHostedService(sp => sp.GetRequiredService<SimulationLoop>());

        return services;
    }
}

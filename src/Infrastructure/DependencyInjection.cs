using Microsoft.Extensions.DependencyInjection;
using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Infrastructure.Framing;
using PlcTelegramSimulator.Infrastructure.Transport;
using PlcTelegramSimulator.Infrastructure.Transport.Simulation;

namespace PlcTelegramSimulator.Infrastructure;

/// <summary>Composition helpers for the Infrastructure layer (framing + TCP transport).</summary>
public static class DependencyInjection
{
    /// <summary>Registers the EOF telegram framer, the simulated PLC TCP transport, the MP/TO gateway, and the inbound router.</summary>
    public static IServiceCollection AddInfrastructure(this IServiceCollection services)
    {
        services.AddSingleton<ITelegramFramer, EofTelegramFramer>();
        services.AddSingleton<IPlcTransport, TcpPlcServer>();
        services.AddSingleton<IMpTelegramGateway, TcpMpTelegramGateway>();
        services.AddHostedService<TcpInboundTelegramRouter>();
        return services;
    }
}

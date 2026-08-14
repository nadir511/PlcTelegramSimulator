using PlcTelegramSimulator.Application.Simulation;

namespace PlcTelegramSimulator.Application.Abstractions;

/// <summary>
/// Port for sending an MP telegram (Status N) to the outer TCP client (ADR-0012). Implemented by
/// the Infrastructure TCP gateway. The Application orchestrator sends through this port and is fed
/// the ACK/TO back as method calls, keeping correlation logic free of sockets.
/// </summary>
public interface IMpTelegramGateway
{
    /// <summary>Sends the MP report outbound to the connected peer.</summary>
    Task SendAsync(MpTelegram telegram, CancellationToken cancellationToken);
}

using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using PlcTelegramSimulator.Application.Connection;
using PlcTelegramSimulator.Application.Messaging;
using PlcTelegramSimulator.Domain;
using PlcTelegramSimulator.Web.Contracts;

namespace PlcTelegramSimulator.Web.Controllers;

/// <summary>
/// Control plane for the simulated PLC listener. Thin by design: every action
/// builds a request and dispatches it through <see cref="ISender"/> to a
/// command/query handler (CQRS-lite, ADR-0005). Live status/traffic is delivered
/// separately over the SignalR hub.
/// </summary>
[ApiController]
[Route("api/connection")]
public sealed class ConnectionController : ControllerBase
{
    private readonly ISender _sender;

    public ConnectionController(ISender sender) => _sender = sender;

    /// <summary>Returns the current listener status snapshot.</summary>
    [HttpGet]
    [ProducesResponseType<ConnectionStatusDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<ConnectionStatusDto>> GetStatus(CancellationToken cancellationToken)
    {
        var snapshot = await _sender.Send(new GetStatusQuery(), cancellationToken);
        return Ok(ContractMapper.ToDto(snapshot));
    }

    /// <summary>Starts (binds) the listener with the supplied configuration.</summary>
    [HttpPost("start")]
    [ProducesResponseType<ConnectionStatusDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ConnectionStatusDto>> Start(
        [FromBody] ListenerConfigRequest request,
        CancellationToken cancellationToken)
    {
        ListenerConfig config;
        try
        {
            config = ListenerConfig.Create(
                request.BindAddress,
                request.SendPort,
                request.ReceivePort,
                request.ProcessingDelayMs,
                request.AutoAcceptReconnections,
                request.EndOfTelegram);
        }
        catch (DomainValidationException ex)
        {
            return ValidationProblem(ToModelState(ex));
        }

        var snapshot = await _sender.Send(new StartListenerCommand(config), cancellationToken);
        return Ok(ContractMapper.ToDto(snapshot));
    }

    /// <summary>Stops the listener, closing any connected clients.</summary>
    [HttpPost("stop")]
    [ProducesResponseType<ConnectionStatusDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<ConnectionStatusDto>> Stop(CancellationToken cancellationToken)
    {
        var snapshot = await _sender.Send(new StopListenerCommand(), cancellationToken);
        return Ok(ContractMapper.ToDto(snapshot));
    }

    /// <summary>Sends a manual outbound telegram to the connected peer.</summary>
    [HttpPost("send")]
    [ProducesResponseType(StatusCodes.Status202Accepted)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Send(
        [FromBody] SendTelegramRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryConvertPayload(request.Payload, out var payload, out var error))
        {
            ModelState.AddModelError("payload", error);
            return ValidationProblem(ModelState);
        }

        var result = await _sender.Send(new SendTelegramCommand(payload), cancellationToken);
        if (!result.PeerConnected)
        {
            return Problem(
                detail: "Cannot send: no client connected.",
                statusCode: StatusCodes.Status409Conflict,
                title: "No peer connected");
        }

        return Accepted();
    }

    private static bool TryConvertPayload(
        IReadOnlyList<int> values,
        out IReadOnlyList<byte> payload,
        out string error)
    {
        payload = [];
        error = string.Empty;

        if (values.Count == 0)
        {
            error = "Payload must contain at least one byte.";
            return false;
        }

        var bytes = new byte[values.Count];
        for (var i = 0; i < values.Count; i++)
        {
            var value = values[i];
            if (value is < 0 or > 255)
            {
                error = $"Payload byte at index {i} ({value}) is out of range (0..255).";
                return false;
            }

            bytes[i] = (byte)value;
        }

        payload = bytes;
        return true;
    }

    private static ModelStateDictionary ToModelState(DomainValidationException exception)
    {
        var modelState = new ModelStateDictionary();
        foreach (var (field, message) in exception.Errors)
        {
            modelState.AddModelError(field, message);
        }

        return modelState;
    }
}

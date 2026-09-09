using Microsoft.AspNetCore.Mvc;
using PlcTelegramSimulator.Application.Messaging;
using PlcTelegramSimulator.Application.Simulation;
using PlcTelegramSimulator.Web.Contracts;

namespace PlcTelegramSimulator.Web.Controllers;

/// <summary>
/// Control plane for the conveyor simulation (ADR-0012). Thin by design: it dispatches a
/// <see cref="ReportArrivalCommand"/> through <see cref="ISender"/> onto the single-writer
/// simulation loop. Authoritative MP/TO state is delivered separately over the SignalR
/// <c>SimulationHub</c>.
/// </summary>
[ApiController]
[Route("api/simulation")]
public sealed class SimulationController : ControllerBase
{
    private readonly ISender _sender;

    public SimulationController(ISender sender) => _sender = sender;

    /// <summary>Reports that a bin reached a message point; enqueues the MP report for the sim loop.</summary>
    [HttpPost("arrivals")]
    [ProducesResponseType(StatusCodes.Status202Accepted)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> ReportArrival(
        [FromBody] ArrivalRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.TransportUnitId))
        {
            ModelState.AddModelError(nameof(request.TransportUnitId), "Transport unit id is required.");
        }

        if (string.IsNullOrWhiteSpace(request.MessagePointId))
        {
            ModelState.AddModelError(nameof(request.MessagePointId), "Message point id is required.");
        }

        EncodedMpTelegram? encoded = null;
        if (request.Telegram is { } telegram)
        {
            if (request.TelegramId is null)
            {
                // ADR-0009: a verbatim frame can only be correlated by its frontend-minted id.
                ModelState.AddModelError(
                    nameof(request.TelegramId), "Telegram id is required when a telegram is supplied.");
            }

            if (!TryMapTelegram(telegram, out encoded, out var telegramError))
            {
                ModelState.AddModelError("telegram", telegramError);
            }
        }

        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var result = await _sender.Send(
            new ReportArrivalCommand(
                request.TransportUnitId, request.MessagePointId, request.TelegramId, encoded),
            cancellationToken);

        if (!result.Accepted)
        {
            return Problem(
                detail: "The simulation loop is not accepting input.",
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Simulation unavailable");
        }

        return Accepted();
    }

    /// <summary>
    /// Maps the wire telegram (ADR-0009) to an <see cref="EncodedMpTelegram"/>: validates the payload
    /// bytes are 0..255 and non-empty. The bytes are relayed verbatim — the frontend has already
    /// encoded every field, including the correlation id — so no field-layout descriptor is needed.
    /// Returns <see langword="false"/> with a message for a malformed payload.
    /// </summary>
    private static bool TryMapTelegram(
        IReadOnlyList<int> payload, out EncodedMpTelegram? encoded, out string error)
    {
        encoded = null;
        error = string.Empty;

        if (payload.Count == 0)
        {
            error = "Telegram payload must contain at least one byte.";
            return false;
        }

        var bytes = new byte[payload.Count];
        for (var i = 0; i < payload.Count; i++)
        {
            var value = payload[i];
            if (value is < 0 or > 255)
            {
                error = $"Telegram payload byte at index {i} ({value}) is out of range (0..255).";
                return false;
            }

            bytes[i] = (byte)value;
        }

        encoded = new EncodedMpTelegram(bytes);
        return true;
    }
}

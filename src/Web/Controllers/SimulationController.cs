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

        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var result = await _sender.Send(
            new ReportArrivalCommand(request.TransportUnitId, request.MessagePointId), cancellationToken);

        if (!result.Accepted)
        {
            return Problem(
                detail: "The simulation loop is not accepting input.",
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Simulation unavailable");
        }

        return Accepted();
    }
}

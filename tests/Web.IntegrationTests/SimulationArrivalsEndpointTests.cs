using System.Net;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace PlcTelegramSimulator.Web.IntegrationTests;

/// <summary>
/// Integration tests for <c>POST /api/simulation/arrivals</c> — the ADR-0009 wire contract
/// <c>{ transportUnitId, messagePointId, telegramId?, telegram?: number[] }</c>. The app boots
/// in-memory (the TCP transport only binds when a listener is started, so nothing binds here) and
/// each acceptance rule is asserted end-to-end through the real MVC pipeline.
/// </summary>
public sealed class SimulationArrivalsEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public SimulationArrivalsEndpointTests(WebApplicationFactory<Program> factory) =>
        // Development skips HTTPS redirection so a plain-HTTP TestServer request reaches the controller.
        _factory = factory.WithWebHostBuilder(builder => builder.UseEnvironment("Development"));

    private async Task<HttpResponseMessage> PostArrivalAsync(string body) =>
        await _factory.CreateClient().PostAsync(
            "/api/simulation/arrivals", new StringContent(body, Encoding.UTF8, "application/json"));

    [Fact]
    public async Task Arrival_WithNeitherTelegramNorId_IsAccepted()
    {
        // Both absent: the backend allocates an id and uses the interim codec.
        var response = await PostArrivalAsync("""{"transportUnitId":"TU-1","messagePointId":"MP1"}""");

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
    }

    [Fact]
    public async Task Arrival_WithTelegramIdOnly_IsAccepted()
    {
        // Id without bytes: interim codec keyed by the supplied id.
        var response = await PostArrivalAsync(
            """{"transportUnitId":"TU-1","messagePointId":"MP1","telegramId":7}""");

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
    }

    [Fact]
    public async Task Arrival_WithTelegramAndId_IsAccepted()
    {
        // Verbatim relay: finished bytes plus the scalar correlation id.
        var response = await PostArrivalAsync(
            """{"transportUnitId":"TU-1","messagePointId":"MP1","telegramId":7,"telegram":[67,86,0,42,78,32,35]}""");

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
    }

    [Fact]
    public async Task Arrival_WithTelegramButNoId_IsRejected()
    {
        // A verbatim frame can only be correlated by its frontend-minted id (ADR-0009) → 400.
        var response = await PostArrivalAsync(
            """{"transportUnitId":"TU-1","messagePointId":"MP1","telegram":[67,86,35]}""");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Arrival_WithOutOfRangeByte_IsRejected()
    {
        var response = await PostArrivalAsync(
            """{"transportUnitId":"TU-1","messagePointId":"MP1","telegramId":7,"telegram":[67,999]}""");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Arrival_WithEmptyTelegram_IsRejected()
    {
        var response = await PostArrivalAsync(
            """{"transportUnitId":"TU-1","messagePointId":"MP1","telegramId":7,"telegram":[]}""");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Arrival_WithMissingTransportUnitId_IsRejected()
    {
        var response = await PostArrivalAsync("""{"messagePointId":"MP1"}""");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}

using System.Text.Json;
using System.Text.Json.Serialization;
using PlcTelegramSimulator.Application;
using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Infrastructure;
using PlcTelegramSimulator.Web.Hubs;
using PlcTelegramSimulator.Web.RealTime;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// CORS policy for the Vite dev/preview app. Credentials are required for SignalR,
// so explicit origins must be listed (AllowAnyOrigin is incompatible with credentials).
const string DevCorsPolicy = "frontend-dev";

builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        // Omit null payload/message/label on traffic rows; ConnectionStatusDto.Error
        // opts back in via [JsonIgnore(Never)] so it always serializes.
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    });

// OpenAPI document (served at /openapi/v1.json in Development), consumed by Scalar.
builder.Services.AddOpenApi();

builder.Services
    .AddSignalR()
    .AddJsonProtocol(options =>
    {
        // The hub protocol does not camelCase by default; the frontend expects camelCase.
        options.PayloadSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.PayloadSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    });

builder.Services.AddCors(options =>
{
    options.AddPolicy(DevCorsPolicy, policy =>
        policy
            .WithOrigins("http://localhost:5173", "http://localhost:4173")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials());
});

builder.Services.AddApplication();
builder.Services.AddInfrastructure();

// Web-side adapter for the real-time broadcast port (Observer fan-out to SignalR).
builder.Services.AddSingleton<IConnectionBroadcaster, SignalRConnectionBroadcaster>();

// Web-side adapter for the simulation MP/TO event port (ADR-0012); fans events to the canvas hub.
builder.Services.AddSingleton<ISimulationEventPublisher, SignalRSimulationEventPublisher>();

var app = builder.Build();

// Interactive API explorer (Development only): OpenAPI JSON + Scalar UI at /scalar.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(options => options.WithTitle("PLC Telegram Simulator API"));
}

// Dev is HTTP-only; only redirect to HTTPS outside Development.
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseCors(DevCorsPolicy);

app.MapControllers();
app.MapHub<ConnectionHub>("/hubs/connection");
app.MapHub<SimulationHub>("/hubs/simulation");

app.Run();

using PlcTelegramSimulator.Domain;

namespace PlcTelegramSimulator.Application.Connection;

/// <summary>Immutable view of the listener at a point in time.</summary>
public readonly record struct ConnectionSnapshot(ListenerStatus Status, string? Error);

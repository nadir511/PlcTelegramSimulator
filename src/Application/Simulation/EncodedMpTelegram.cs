namespace PlcTelegramSimulator.Application.Simulation;

/// <summary>
/// The complete, frontend-encoded MP telegram for a bin arrival (ADR-0009): the finished wire bytes,
/// with every field — including the correlation <c>TelegramId</c> — already encoded by the frontend
/// (empty/short fields padded per ADR-0014). The backend relays these bytes verbatim; when no such
/// payload is supplied the loop falls back to the interim <see cref="MpTelegram"/> string codec.
/// <para>
/// This is plain transport-shaped data (no sockets, no byte manipulation), so it lives in the
/// Application layer and threads through the ports; the actual send happens in Infrastructure.
/// </para>
/// </summary>
/// <param name="Payload">The finished telegram bytes (each 0..255), sent to the client unchanged.</param>
public sealed record EncodedMpTelegram(IReadOnlyList<byte> Payload);

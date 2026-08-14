namespace PlcTelegramSimulator.Application.Connection;

/// <summary>
/// Outcome of a <see cref="SendTelegramCommand"/>. <see cref="PeerConnected"/> is
/// <c>false</c> when no peer was connected, letting the controller map to HTTP 409.
/// </summary>
public readonly record struct SendResult(bool PeerConnected);

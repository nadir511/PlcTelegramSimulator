using System.IO.Pipelines;

namespace PlcTelegramSimulator.Infrastructure.Framing;

/// <summary>
/// Strategy for turning telegram payloads into framed bytes and back. Different
/// wire framings (delimiter, length-prefixed, fixed-length, ...) implement this
/// so the transport is agnostic to the concrete framing.
/// </summary>
/// <remarks>
/// The framing <paramref name="terminator"/> is supplied by the caller (it comes
/// from the connection's End-of-Telegram configuration, ADR-0018) rather than being
/// baked into the framer, so the same strategy instance frames every telegram with
/// whatever terminator the current session was started with.
/// </remarks>
public interface ITelegramFramer
{
    /// <summary>
    /// Wraps a payload into a complete on-the-wire frame, appending
    /// <paramref name="terminator"/> as the End-of-Telegram delimiter.
    /// </summary>
    byte[] Encode(IReadOnlyList<byte> payload, ReadOnlyMemory<byte> terminator);

    /// <summary>
    /// Streams decoded payloads from a <see cref="PipeReader"/> until it completes
    /// or is cancelled, splitting the stream on <paramref name="terminator"/>. Each
    /// yielded array is the inner payload (framing removed). Framing faults (e.g. an
    /// oversized unterminated frame) are reported via <paramref name="onError"/>
    /// rather than throwing, and the reader resyncs.
    /// </summary>
    IAsyncEnumerable<byte[]> ReadFramesAsync(
        PipeReader reader,
        ReadOnlyMemory<byte> terminator,
        Action<string>? onError,
        CancellationToken cancellationToken);
}

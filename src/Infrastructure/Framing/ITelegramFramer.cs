using System.IO.Pipelines;

namespace PlcTelegramSimulator.Infrastructure.Framing;

/// <summary>
/// Strategy for turning telegram payloads into framed bytes and back. Different
/// wire framings (delimiter, length-prefixed, fixed-length, ...) implement this
/// so the transport is agnostic to the concrete framing.
/// </summary>
public interface ITelegramFramer
{
    /// <summary>Wraps a payload into a complete on-the-wire frame.</summary>
    byte[] Encode(IReadOnlyList<byte> payload);

    /// <summary>
    /// Streams decoded payloads from a <see cref="PipeReader"/> until it completes
    /// or is cancelled. Each yielded array is the inner payload (framing removed).
    /// Framing faults (e.g. an oversized unterminated frame) are reported via
    /// <paramref name="onError"/> rather than throwing, and the reader resyncs.
    /// </summary>
    IAsyncEnumerable<byte[]> ReadFramesAsync(
        PipeReader reader,
        Action<string>? onError,
        CancellationToken cancellationToken);
}

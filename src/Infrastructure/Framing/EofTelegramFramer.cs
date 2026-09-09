using System.Buffers;
using System.IO.Pipelines;
using System.Runtime.CompilerServices;

namespace PlcTelegramSimulator.Infrastructure.Framing;

/// <summary>
/// End-of-Telegram framing: a frame is <c>&lt;payload…&gt;&lt;terminator&gt;</c> — the telegram
/// content written verbatim followed by the caller-supplied End-of-Telegram delimiter
/// (one or more bytes, e.g. <c>'#'</c> or <c>'~'</c>). There is <b>no</b> start-of-message
/// byte, so the first wire byte is the first payload byte. This matches the eHub ATI wire
/// format, where every telegram begins directly with the source-name field and ends with a
/// single delimiter. Decoding yields the bytes before each terminator and resyncs; an
/// unterminated frame longer than <see cref="MaxFrameLength"/> is reported and discarded.
/// </summary>
/// <remarks>
/// The terminator is a per-call parameter (sourced from the connection's End-of-Telegram
/// configuration, ADR-0018) rather than a constant, so one framer instance serves whatever
/// delimiter the session was started with. Simple delimiter framing assumes payloads do not
/// themselves contain the terminator sequence (no escaping), which matches the simulator's
/// telegram set.
/// </remarks>
public sealed class EofTelegramFramer : ITelegramFramer
{
    /// <summary>Maximum length of an unterminated frame before it is discarded.</summary>
    public const int MaxFrameLength = 4096;

    public byte[] Encode(IReadOnlyList<byte> payload, ReadOnlyMemory<byte> terminator)
    {
        ArgumentNullException.ThrowIfNull(payload);
        if (terminator.IsEmpty)
        {
            throw new ArgumentException("Terminator must not be empty.", nameof(terminator));
        }

        var term = terminator.Span;
        var frame = new byte[payload.Count + term.Length];
        for (var i = 0; i < payload.Count; i++)
        {
            frame[i] = payload[i];
        }

        term.CopyTo(frame.AsSpan(payload.Count));
        return frame;
    }

    public async IAsyncEnumerable<byte[]> ReadFramesAsync(
        PipeReader reader,
        ReadOnlyMemory<byte> terminator,
        Action<string>? onError,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(reader);
        if (terminator.IsEmpty)
        {
            throw new ArgumentException("Terminator must not be empty.", nameof(terminator));
        }

        try
        {
            while (true)
            {
                ReadResult result;
                try
                {
                    result = await reader.ReadAsync(cancellationToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    break;
                }

                var buffer = result.Buffer;

                while (TryExtractFrame(ref buffer, terminator.Span, onError, out var frame))
                {
                    yield return frame;
                }

                // Consumed up to buffer.Start; examined everything so far.
                reader.AdvanceTo(buffer.Start, buffer.End);

                if (result.IsCompleted)
                {
                    break;
                }
            }
        }
        finally
        {
            // Runs on normal completion and on early disposal (consumer break/throw).
            await reader.CompleteAsync().ConfigureAwait(false);
        }
    }

    /// <summary>
    /// Extracts the next complete frame (bytes up to the next <paramref name="terminator"/>)
    /// from <paramref name="buffer"/>, advancing it past the consumed bytes. Returns
    /// <c>false</c> when more data is needed, keeping the partial frame buffered.
    /// </summary>
    private static bool TryExtractFrame(
        ref ReadOnlySequence<byte> buffer,
        ReadOnlySpan<byte> terminator,
        Action<string>? onError,
        out byte[] frame)
    {
        frame = [];

        if (buffer.IsEmpty)
        {
            return false;
        }

        var reader = new SequenceReader<byte>(buffer);

        if (reader.TryReadTo(out ReadOnlySequence<byte> inner, terminator, advancePastDelimiter: true))
        {
            if (inner.Length <= MaxFrameLength)
            {
                frame = inner.ToArray();
                buffer = buffer.Slice(reader.Position); // consume through terminator
                return true;
            }

            // Terminated but oversized: discard and resync after the terminator.
            onError?.Invoke("frame too long, discarded");
            buffer = buffer.Slice(reader.Position);
            return false;
        }

        // No terminator yet: guard against an unterminated runaway frame.
        if (buffer.Length > MaxFrameLength)
        {
            onError?.Invoke("frame too long, discarded");
            buffer = buffer.Slice(buffer.End); // drop the runaway bytes and resync
            return false;
        }

        // Keep the partial frame and wait for more bytes.
        return false;
    }
}

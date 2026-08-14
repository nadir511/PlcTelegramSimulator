using System.Buffers;
using System.IO.Pipelines;
using System.Runtime.CompilerServices;

namespace PlcTelegramSimulator.Infrastructure.Framing;

/// <summary>
/// EOF-terminated framing: a frame is <c>&lt;payload…&gt; 0x7E</c> — the telegram
/// content written verbatim followed by a single trailing <c>'~'</c> (EOF) sentinel.
/// There is <b>no</b> start-of-message byte, so the first wire byte is the first
/// payload byte. This matches the eHub ATI wire format, where every telegram begins
/// directly with the source-name field and ends with a single <c>'~'</c>. Decoding
/// yields the bytes before each <c>'~'</c> and resyncs; an unterminated frame longer
/// than <see cref="MaxFrameLength"/> is reported and discarded.
/// </summary>
/// <remarks>
/// Simple delimiter framing assumes payloads do not themselves contain the EOF
/// control byte (no escaping), which matches the simulator's telegram set.
/// </remarks>
public sealed class EofTelegramFramer : ITelegramFramer
{
    /// <summary>End-of-frame sentinel ('~').</summary>
    public const byte Eof = 0x7E;

    /// <summary>Maximum length of an unterminated frame before it is discarded.</summary>
    public const int MaxFrameLength = 4096;

    public byte[] Encode(IReadOnlyList<byte> payload)
    {
        ArgumentNullException.ThrowIfNull(payload);

        var frame = new byte[payload.Count + 1];
        for (var i = 0; i < payload.Count; i++)
        {
            frame[i] = payload[i];
        }

        frame[^1] = Eof;
        return frame;
    }

    public async IAsyncEnumerable<byte[]> ReadFramesAsync(
        PipeReader reader,
        Action<string>? onError,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(reader);

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

                while (TryExtractFrame(ref buffer, onError, out var frame))
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
    /// Extracts the next complete frame (bytes up to the next EOF) from
    /// <paramref name="buffer"/>, advancing it past the consumed bytes. Returns
    /// <c>false</c> when more data is needed, keeping the partial frame buffered.
    /// </summary>
    private static bool TryExtractFrame(ref ReadOnlySequence<byte> buffer, Action<string>? onError, out byte[] frame)
    {
        frame = [];

        if (buffer.IsEmpty)
        {
            return false;
        }

        var reader = new SequenceReader<byte>(buffer);

        if (reader.TryReadTo(out ReadOnlySequence<byte> inner, Eof, advancePastDelimiter: true))
        {
            if (inner.Length <= MaxFrameLength)
            {
                frame = inner.ToArray();
                buffer = buffer.Slice(reader.Position); // consume through EOF
                return true;
            }

            // Terminated but oversized: discard and resync after the EOF.
            onError?.Invoke("frame too long, discarded");
            buffer = buffer.Slice(reader.Position);
            return false;
        }

        // No EOF yet: guard against an unterminated runaway frame.
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

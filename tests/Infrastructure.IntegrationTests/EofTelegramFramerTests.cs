using System.IO.Pipelines;
using System.Text;
using PlcTelegramSimulator.Infrastructure.Framing;

namespace PlcTelegramSimulator.Infrastructure.IntegrationTests;

public sealed class EofTelegramFramerTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(2);

    // The eHub delimiter '~'; the framer takes the terminator as a parameter now.
    private static readonly byte[] Eof = { 0x7E };

    private readonly EofTelegramFramer _framer = new();

    [Fact]
    public void Encode_AppendsTerminatorWithoutStartByte()
    {
        var frame = _framer.Encode(new byte[] { 0x41, 0x42, 0x43 }, Eof);

        // No leading STX; content verbatim; single trailing '~' (0x7E).
        Assert.Equal(new byte[] { 0x41, 0x42, 0x43, 0x7E }, frame);
    }

    [Fact]
    public void Encode_DoesNotPrependStx_FirstByteIsPayload()
    {
        // Mirrors the eHub sample: source name starts with 'C' (0x43).
        var payload = Encoding.Latin1.GetBytes("CV05000001N MP");

        var frame = _framer.Encode(payload, Eof);

        Assert.Equal(0x43, frame[0]);
        Assert.DoesNotContain((byte)0x02, frame);
        Assert.Equal(0x7E, frame[^1]);
        Assert.Equal(payload.Length + 1, frame.Length);
    }

    [Fact]
    public void Encode_WithHashTerminator_AppendsConfiguredDelimiter()
    {
        var frame = _framer.Encode(new byte[] { 0x4d, 0x50 }, new byte[] { 0x23 });

        // '#' (0x23) is appended instead of '~' — the terminator is caller-supplied.
        Assert.Equal(new byte[] { 0x4d, 0x50, 0x23 }, frame);
    }

    [Fact]
    public void Encode_WithEmptyTerminator_Throws()
    {
        Assert.Throws<ArgumentException>(() => _framer.Encode(new byte[] { 0x01 }, ReadOnlyMemory<byte>.Empty));
    }

    [Fact]
    public async Task RoundTrip_DecodeYieldsOriginalPayload()
    {
        var payload = new byte[] { 0x4d, 0x50, 0x30, 0x31, 0x00 };
        var frame = _framer.Encode(payload, Eof);

        var frames = await DecodeAsync(frame);

        var decoded = Assert.Single(frames);
        Assert.Equal(payload, decoded);
    }

    [Fact]
    public async Task RoundTrip_WithMultiByteTerminator_EncodesAndDecodes()
    {
        // A multi-character End-of-Telegram (e.g. "#!" = 0x23 0x21) frames and splits correctly.
        byte[] terminator = { 0x23, 0x21 };
        var first = _framer.Encode(new byte[] { 0x01, 0x02 }, terminator);
        var second = _framer.Encode(new byte[] { 0x03 }, terminator);

        Assert.Equal(new byte[] { 0x01, 0x02, 0x23, 0x21 }, first);

        var frames = await DecodeAsync([.. first, .. second], terminator: terminator);

        Assert.Equal(2, frames.Count);
        Assert.Equal(new byte[] { 0x01, 0x02 }, frames[0]);
        Assert.Equal(new byte[] { 0x03 }, frames[1]);
    }

    [Fact]
    public async Task Decode_TwoBackToBackFrames_YieldsBoth()
    {
        // Payloads must not contain the terminator byte (unescaped delimiter framing).
        var first = _framer.Encode(new byte[] { 0x01 }, Eof);
        var second = _framer.Encode(new byte[] { 0x04, 0x05 }, Eof);

        var frames = await DecodeAsync([.. first, .. second]);

        Assert.Equal(2, frames.Count);
        Assert.Equal(new byte[] { 0x01 }, frames[0]);
        Assert.Equal(new byte[] { 0x04, 0x05 }, frames[1]);
    }

    [Fact]
    public async Task Decode_UnterminatedOversizeFrame_ReportsErrorAndYieldsNothing()
    {
        // > MaxFrameLength bytes and never a terminator.
        byte[] oversize = new byte[EofTelegramFramer.MaxFrameLength + 100];
        for (var i = 0; i < oversize.Length; i++)
        {
            oversize[i] = 0x41; // 'A' — never the terminator byte
        }

        var errors = new List<string>();
        var frames = await DecodeAsync(oversize, errors.Add);

        Assert.Empty(frames);
        Assert.Contains("frame too long, discarded", errors);
    }

    [Fact]
    public async Task Decode_ResyncsAfterOversizeFrame()
    {
        // An oversized but terminated frame is discarded; the next frame decodes.
        // (EOF-only framing has no start delimiter, so recovery is only possible after
        // the oversized frame's own terminator.)
        byte[] oversize = new byte[EofTelegramFramer.MaxFrameLength + 50];
        for (var i = 0; i < oversize.Length; i++)
        {
            oversize[i] = 0x41;
        }

        var good = _framer.Encode(new byte[] { 0x77 }, Eof);
        byte[] combined = [.. oversize, .. Eof, .. good];

        var errors = new List<string>();
        var frames = await DecodeAsync(combined, errors.Add);

        Assert.Contains("frame too long, discarded", errors);
        var decoded = Assert.Single(frames);
        Assert.Equal(new byte[] { 0x77 }, decoded);
    }

    [Fact]
    public async Task Decode_EmptyPayloadFrame_YieldsEmptyArray()
    {
        var frame = _framer.Encode([], Eof);

        var frames = await DecodeAsync(frame);

        var decoded = Assert.Single(frames);
        Assert.Empty(decoded);
    }

    private async Task<List<byte[]>> DecodeAsync(byte[] bytes, Action<string>? onError = null, byte[]? terminator = null)
    {
        using var cts = new CancellationTokenSource(Timeout);
        var reader = PipeReader.Create(new MemoryStream(bytes));
        var frames = new List<byte[]>();
        await foreach (var frame in _framer.ReadFramesAsync(reader, terminator ?? Eof, onError, cts.Token))
        {
            frames.Add(frame);
        }

        return frames;
    }
}

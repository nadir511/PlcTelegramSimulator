using System.IO.Pipelines;
using System.Text;
using PlcTelegramSimulator.Infrastructure.Framing;

namespace PlcTelegramSimulator.Infrastructure.IntegrationTests;

public sealed class EofTelegramFramerTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(2);

    private readonly EofTelegramFramer _framer = new();

    [Fact]
    public void Encode_AppendsEofWithoutStartByte()
    {
        var frame = _framer.Encode(new byte[] { 0x41, 0x42, 0x43 });

        // No leading STX; content verbatim; single trailing '~' (0x7E).
        Assert.Equal(new byte[] { 0x41, 0x42, 0x43, 0x7E }, frame);
    }

    [Fact]
    public void Encode_DoesNotPrependStx_FirstByteIsPayload()
    {
        // Mirrors the eHub sample: source name starts with 'C' (0x43).
        var payload = Encoding.Latin1.GetBytes("CV05000001N MP");

        var frame = _framer.Encode(payload);

        Assert.Equal(0x43, frame[0]);
        Assert.DoesNotContain((byte)0x02, frame);
        Assert.Equal(0x7E, frame[^1]);
        Assert.Equal(payload.Length + 1, frame.Length);
    }

    [Fact]
    public async Task RoundTrip_DecodeYieldsOriginalPayload()
    {
        var payload = new byte[] { 0x4d, 0x50, 0x30, 0x31, 0x00 };
        var frame = _framer.Encode(payload);

        var frames = await DecodeAsync(frame);

        var decoded = Assert.Single(frames);
        Assert.Equal(payload, decoded);
    }

    [Fact]
    public async Task Decode_TwoBackToBackFrames_YieldsBoth()
    {
        // Payloads must not contain the EOF byte (unescaped delimiter framing).
        var first = _framer.Encode(new byte[] { 0x01 });
        var second = _framer.Encode(new byte[] { 0x04, 0x05 });

        var frames = await DecodeAsync([.. first, .. second]);

        Assert.Equal(2, frames.Count);
        Assert.Equal(new byte[] { 0x01 }, frames[0]);
        Assert.Equal(new byte[] { 0x04, 0x05 }, frames[1]);
    }

    [Fact]
    public async Task Decode_UnterminatedOversizeFrame_ReportsErrorAndYieldsNothing()
    {
        // > MaxFrameLength bytes and never an EOF.
        byte[] oversize = new byte[EofTelegramFramer.MaxFrameLength + 100];
        for (var i = 0; i < oversize.Length; i++)
        {
            oversize[i] = 0x41; // 'A' — never the EOF byte
        }

        var errors = new List<string>();
        var frames = await DecodeAsync(oversize, errors.Add);

        Assert.Empty(frames);
        Assert.Contains("frame too long, discarded", errors);
    }

    [Fact]
    public async Task Decode_ResyncsAfterOversizeFrame()
    {
        // An oversized but EOF-terminated frame is discarded; the next frame decodes.
        // (EOF-only framing has no start delimiter, so recovery is only possible after
        // the oversized frame's own terminator.)
        byte[] oversize = new byte[EofTelegramFramer.MaxFrameLength + 50];
        for (var i = 0; i < oversize.Length; i++)
        {
            oversize[i] = 0x41;
        }

        var good = _framer.Encode(new byte[] { 0x77 });
        byte[] combined = [.. oversize, EofTelegramFramer.Eof, .. good];

        var errors = new List<string>();
        var frames = await DecodeAsync(combined, errors.Add);

        Assert.Contains("frame too long, discarded", errors);
        var decoded = Assert.Single(frames);
        Assert.Equal(new byte[] { 0x77 }, decoded);
    }

    [Fact]
    public async Task Decode_EmptyPayloadFrame_YieldsEmptyArray()
    {
        var frame = _framer.Encode([]);

        var frames = await DecodeAsync(frame);

        var decoded = Assert.Single(frames);
        Assert.Empty(decoded);
    }

    private async Task<List<byte[]>> DecodeAsync(byte[] bytes, Action<string>? onError = null)
    {
        using var cts = new CancellationTokenSource(Timeout);
        var reader = PipeReader.Create(new MemoryStream(bytes));
        var frames = new List<byte[]>();
        await foreach (var frame in _framer.ReadFramesAsync(reader, onError, cts.Token))
        {
            frames.Add(frame);
        }

        return frames;
    }
}

using PlcTelegramSimulator.Application.Abstractions;
using PlcTelegramSimulator.Application.Simulation;

namespace PlcTelegramSimulator.Application.UnitTests.Fakes;

/// <summary>Test double for <see cref="IMpTelegramGateway"/> that records every MP telegram sent.</summary>
public sealed class FakeMpTelegramGateway : IMpTelegramGateway
{
    private readonly List<MpTelegram> _sent = [];

    public IReadOnlyList<MpTelegram> Sent => _sent;

    public Task SendAsync(MpTelegram telegram, CancellationToken cancellationToken)
    {
        _sent.Add(telegram);
        return Task.CompletedTask;
    }
}

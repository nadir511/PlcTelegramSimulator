using PlcTelegramSimulator.Application.Simulation;

namespace PlcTelegramSimulator.Web.Contracts;

/// <summary>
/// Maps simulation application types to wire DTOs (ADR-0012). Enum-to-token mapping is explicit so
/// the exact lowercase literals the frontend expects are guaranteed, mirroring
/// <see cref="ContractMapper"/>.
/// </summary>
public static class SimulationContractMapper
{
    /// <summary>Maps an <see cref="MpTelegram"/> to its <c>mpReported</c> DTO.</summary>
    public static MpReportedDto ToDto(MpTelegram telegram) =>
        new()
        {
            TelegramId = telegram.TelegramId,
            TransportUnitId = telegram.TransportUnitId,
            MessagePointId = telegram.MessagePointId,
        };

    /// <summary>Maps a <see cref="TransportOrder"/> to its <c>transportOrder</c> DTO.</summary>
    public static TransportOrderDto ToDto(TransportOrder order) =>
        new()
        {
            TelegramId = order.TelegramId,
            TransportUnitId = order.TransportUnitId,
            MessagePointId = order.MessagePointId,
            Destination = order.Destination,
        };

    /// <summary>Maps a timed-out request and its reason to a <c>fault</c> DTO.</summary>
    public static SimulationFaultDto ToDto(PendingMpRequest request, MpTimeoutReason reason) =>
        new()
        {
            TelegramId = request.TelegramId,
            TransportUnitId = request.TransportUnitId,
            MessagePointId = request.MessagePointId,
            Reason = ToToken(reason),
        };

    /// <summary>Maps a timeout reason to its lowercase wire token.</summary>
    public static string ToToken(MpTimeoutReason reason) => reason switch
    {
        MpTimeoutReason.Acknowledgement => "ack",
        MpTimeoutReason.TransportOrder => "to",
        _ => throw new ArgumentOutOfRangeException(nameof(reason), reason, "Unknown timeout reason."),
    };
}

# 11. EOF-terminated telegram framing (`~`)

- **Status:** Accepted
- **Date:** 2026-08-12
- **Deciders:** PlcTelegramSimulator team

## Context and problem statement

[ADR-0007](0007-connection-api-and-transport-model.md) framed outgoing telegrams as
`0x02 <payload…> 0x03` (STX/ETX). Integrating against the real **eHub ATI** telegram parser
revealed that its wire format has **no start-of-message byte**: each telegram begins directly with
the 11-byte source-name field and ends with a single `~` (`0x7E`) end-of-frame sentinel. The
simulator's leading `0x02` shifts every field right by one byte, so the ATI reads the telegram-type
field as `" M"` instead of `"MP"` and rejects the message:

```
InvalidDataException: Got unrecognized telegram type: ' M'
```

For a representative telegram the broken wire form is 150 bytes starting `02 43 56 …`; the required
form is 149 bytes starting `43 56 …` (`'C' 'V' …`) and ending `7E`. ADR-0007 anticipated this:
framing is a swappable **Strategy** (`ITelegramFramer`) and it noted "delimiter framing may be
superseded." This ADR records that supersession for the framing sub-decision only; the rest of
ADR-0007 (REST control plane, two-socket send/receive model, ACK behaviour) is unchanged.

## Decision drivers

- **eHub ATI interoperability** — the first wire byte must be the first payload byte; the only
  framing byte is the trailing `~`.
- **Symmetry** — the same framer encodes manual sends and ACKs and decodes inbound telegrams, so
  all three must agree on the wire format.
- **Minimal, testable change** behind the existing `ITelegramFramer` port, no `Domain`/`Application`
  churn.
- **Robust decoding** of a byte stream (partial reads, back-to-back frames, runaway/oversized
  frames).

## Considered options

1. **EOF-only framing** — `Encode` = `payload + 0x7E`; decode yields the bytes before each `0x7E`.
2. **Keep STX/ETX and strip STX only at send** — asymmetric hack; leaves decode/ACK inconsistent.
3. **Make the framing configurable per connection** (STX/ETX vs EOF) — more surface than slice needs.

## Decision outcome

**Chosen option:** "EOF-only framing," via a new `EofTelegramFramer : ITelegramFramer` registered as
the default framer in `Infrastructure` DI (replacing `DelimitedTelegramFramer`, which is removed).
`Encode` writes the payload verbatim then appends a single `0x7E`; `ReadFramesAsync` scans a
`System.IO.Pipelines` stream and yields the bytes up to each `0x7E`, resyncing after a terminated
oversized frame and discarding an unterminated runaway longer than `MaxFrameLength`. The `~` is a
protocol constant (`EofTelegramFramer.Eof`); the payload handed to `send` must **not** already
include it — the framer appends exactly one.

### Consequences

- **Positive:** Outgoing telegrams match the eHub ATI wire format (first byte `0x43`, trailing
  `0x7E`, no `0x02`; the sample drops 150→149 bytes) and the ATI parses telegram types correctly.
  Send, ACK (`06 7E`), and inbound decode stay symmetric. The change is isolated behind the port; no
  `Domain`/`Application` or frontend change.
- **Negative:** Framing is still **ambiguous if a payload itself contains `0x7E`** (no escaping) —
  acceptable for the current telegram set, which reserves `~` as the terminator. Removing
  `DelimitedTelegramFramer` drops the STX/ETX option; re-adding it later is a new Strategy.
  Unlike STX/ETX, EOF-only framing has no start delimiter, so an unterminated oversized run cannot
  resync mid-stream — it is discarded up to the next terminator.
- **Neutral / follow-ups:** If a future device needs a different terminator or escaping, add a
  configurable/length-prefixed Strategy behind `ITelegramFramer`. The frontend Telegram Builder's
  "End of Telegram" preview character ([ADR-0009](0009-telegram-template-model.md)) is a separate
  presentation-layer concern from this wire terminator.

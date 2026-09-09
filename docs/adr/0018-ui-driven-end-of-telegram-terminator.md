# 18. UI-driven End-of-Telegram terminator (configurable, default `~`)

- **Status:** Accepted
- **Date:** 2026-08-12
- **Deciders:** PlcTelegramSimulator team

Supersedes [ADR-0011](0011-eof-terminated-telegram-framing.md).

## Context and problem statement

[ADR-0011](0011-eof-terminated-telegram-framing.md) replaced the STX/ETX framing of
[ADR-0007](0007-connection-api-and-transport-model.md) with **EOF framing**: each outgoing telegram
begins directly with its payload (no `0x02` start byte) and ends with a single frame terminator, and
the same framer decodes inbound frames on that terminator. That fixed eHub ATI interoperability but
**hardcoded** the terminator as `~` (`0x7E`) in the framer (`EofTelegramFramer.Eof`).

The terminator is **not universal** — it varies per deployment/parser. The frontend telegram type
registry already exposes an **End of Telegram** field ([ADR-0009](0009-telegram-template-model.md))
as the operator-facing terminator. Hardcoding `~` in the transport contradicts that field and forces
a code change per integration, so the terminator must be **configurable and sourced from that one
field** rather than baked into the framer.

## Decision drivers

- **eHub ATI interoperability** — the first wire byte must be the first payload byte; the only
  framing byte(s) must be the trailing terminator. eHub's terminator is `~` (`0x7E`).
- **One source of truth** — the operator sets the terminator once (the registry's End-of-Telegram
  field); manual sends, simulated telegrams, ACKs, and inbound decoding all use that value, with no
  second place that appends it.
- **Symmetry** — the same framer encodes sends and ACKs and decodes inbound telegrams, so all three
  agree on the wire terminator.
- **Minimal, testable change** behind the existing `ITelegramFramer` port; the terminator crosses
  `Domain` (validated) and the Web contract, but needs no `Application` churn.
- **Robust decoding** of a byte stream (partial reads, back-to-back frames, runaway/oversized
  frames) for a possibly multi-byte terminator.

## Considered options

1. **Keep the hardcoded `~`** (ADR-0011) — simplest, but wrong for any non-eHub parser and in direct
   conflict with the UI End-of-Telegram field.
2. **Configurable terminator threaded from the UI** — the framer takes the terminator as a
   parameter; the value flows frontend → connection config → transport as one operator-chosen value.
3. **A per-connection framing enum (STX/ETX vs EOF)** — more surface than the slice needs; the wire
   format is settled as EOF, only the terminator byte varies.

## Decision outcome

**Chosen option:** "Configurable terminator threaded from the UI," because it satisfies *one source
of truth*, *interoperability*, and *symmetry* with the smallest change. `EofTelegramFramer :
ITelegramFramer` stays the default framer in `Infrastructure` DI but holds **no** terminator
constant: `Encode(payload, terminator)` writes the payload verbatim then appends the caller-supplied
terminator bytes, and `ReadFramesAsync(reader, terminator, …)` scans a `System.IO.Pipelines` stream
and yields the bytes up to each terminator (resyncing after a terminated oversized frame, discarding
an unterminated runaway longer than `MaxFrameLength`).

The terminator originates from the frontend **End of Telegram** field and flows through the stack as
one value:

- **Frontend** sends it on connect (`POST /api/connection/start` carries `endOfTelegram`); no
  frontend path appends it to a payload (the conveyor-canvas encoder emits fields only), so the wire
  carries **exactly one** terminator. An empty field falls back to the default terminator — EOF
  framing always needs a delimiter, so a connection never carries an empty terminator.
- **`Domain.ListenerConfig`** validates it (non-empty, ≤ 8 chars, single-byte Latin-1) and exposes
  its `Terminator` bytes.
- **`TcpPlcServer`** captures those bytes at `StartAsync` and passes them to every `Encode` (manual
  send + ACK) and to `ReadFramesAsync` for inbound decoding.

The shipped default is **`~` (`0x7E`)** everywhere — frontend `DEFAULT_END_OF_TELEGRAM`, the Web
`ListenerConfigRequest`, `ListenerConfig.Create`, and the `TcpPlcServer` pre-start fallback — so eHub
works out of the box and a different device only changes the field. The payload handed to `send` must
**not** already include the terminator; the framer appends exactly one.

### Consequences

- **Positive:** Outgoing telegrams match the target wire format (first byte `0x43`, no `0x02`, a
  single trailing terminator) and the parser reads telegram types correctly. Send, ACK, and inbound
  decode stay symmetric on one operator-chosen terminator, so a different device needs a settings
  change, not a code change. The change stays behind the port with no `Application` involvement.
- **Negative:** The terminator crosses one more layer (Web contract + `Domain` validation) than a
  hardcoded byte would. It is bound at `StartAsync`, so **changing the End-of-Telegram value takes
  effect only on reconnect**. Framing is still **ambiguous if a payload itself contains the
  terminator bytes** (no escaping) — acceptable for the current telegram set, which reserves the
  terminator. EOF framing has no start delimiter, so an unterminated oversized run is discarded up to
  the next terminator rather than resyncing mid-stream. The registry preview treats an empty field as
  "no terminator", while a connection coerces empty to the default `~` — a deliberate, documented
  gap surfaced by the field's hint text.
- **Neutral / follow-ups:** If a future device needs escaping or length-prefixed framing, add a
  Strategy behind `ITelegramFramer`. The frontend Telegram Builder's **End of Telegram** field
  ([ADR-0009](0009-telegram-template-model.md)) is now the single source of this wire terminator, not
  a separate presentation-only concern.

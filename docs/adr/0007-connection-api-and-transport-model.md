# 7. Connection control API and TCP transport model

- **Status:** Accepted <!-- STX/ETX framing superseded by [ADR-0011](0011-eof-terminated-telegram-framing.md); API + two-socket model still in effect -->
- **Date:** 2026-08-11
- **Deciders:** PlcTelegramSimulator team

## Context and problem statement

The first backend vertical slice backs the already-built **Connection & Session Management** page.
That page must (a) **control** a simulated PLC listener — configure it, start/stop it, and send a
manual telegram — and (b) watch **live status and traffic**. The React app already defines the
client side of this contract (`ListenerConfig`, a status snapshot, and a `TrafficEntry` log row);
the backend now has to expose a matching HTTP control plane and behave as a real TCP endpoint that
a peer can connect to, so integrations can be exercised without PLC hardware.

Three things need pinning down together because they form one contract: the **REST shape**, the
**real-time message payloads** ([ADR-0006](0006-real-time-transport.md) chose SignalR as the
channel), and the **TCP transport/framing model** — how the simulator presents itself on the wire
and how telegram bytes are delimited. Constraints: match the existing frontend contract exactly;
keep sockets/codecs in `Infrastructure` behind an `Application` port
([ADR-0003](0003-repository-structure.md)/[ADR-0005](0005-backend-architecture-and-patterns.md));
and keep this to slice #1 ("send one telegram") without gold-plating.

## Decision drivers

- **Match the built frontend** `ConnectionClient` contract — no gratuitous divergence.
- **Clear, predictable control plane** (start / stop / send / status) that maps to REST verbs.
- **Explicit send vs. receive semantics** — the UI already exposes a *send port* and a *receive port*.
- **A framing scheme that fits the sample telegrams** (STX … ETX) and is trivially testable.
- **Boundary isolation & extensibility** — swap or extend framing (length-prefix, fixed-length,
  CRC) later without touching `Domain`/`Application`.

## Considered options

1. **Two-socket TCP *server* + STX/ETX delimiter framing** — the simulator listens on two ports
   (receive = peer→sim inbound, send = sim→peer outbound); telegrams are delimited by `0x02 … 0x03`.
2. **Single-socket bidirectional server** on one port, with framing to disambiguate direction.
3. **Simulator as a TCP *client*** that dials out to a real/remote PLC endpoint.

For the wire framing specifically: **delimiter (STX/ETX)** vs. **length-prefixed** vs.
**fixed-length** frames.

## Decision outcome

**Chosen option:** "Two-socket TCP server + STX/ETX delimiter framing," because it maps directly
onto the UI's existing *send port* / *receive port* fields and the sample telegrams, and keeps the
first slice trivially testable.

**REST control plane** (thin controllers dispatching to CQRS-lite handlers per ADR-0005):

| Method & route | Body | Result |
| --- | --- | --- |
| `GET  /api/connection` | – | `ConnectionStatus` snapshot |
| `POST /api/connection/start` | `ListenerConfig` | snapshot; `400` on validation error |
| `POST /api/connection/stop` | – | snapshot |
| `POST /api/connection/send` | `{ payload: number[] }` | `200`; `409` if no peer connected |

**Wire payloads** (System.Text.Json, camelCase). `ConnectionStatus` = `{ status, error }` with
`status ∈ {stopped, starting, listening, connected, error}`. `TrafficEntry` =
`{ id, timestamp, level, payload?, message?, label? }` where `timestamp` is **epoch
milliseconds**, `level ∈ {out, in, error, system}`, and **`payload` is a JSON array of byte values
(numbers), not base64**. The SignalR hub (`/hubs/connection`) pushes these as the `status` and
`traffic` methods (ADR-0006).

**TCP transport model** (in `Infrastructure`, an **Adapter** behind the `IPlcTransport` port):

- The simulator is a **TCP server** bound to the configured address on **two ports**. The
  **receive port** accepts a peer that *sends telegrams to* the simulator (logged `in`); after the
  configured **processing delay** the simulator returns an **ACK (`0x06`)** on that connection
  (logged `out`). The **send port** accepts a peer that *receives telegrams from* the simulator;
  a manual **send** writes to it (logged `out`, label `MANUAL`), and anything the peer writes back
  is logged `in`. Status is `connected` while any peer is attached and returns to `listening` when
  the last one drops (honoring `autoAcceptReconnections`).
- **Framing** is a **Strategy** (`ITelegramFramer`): the initial `DelimitedTelegramFramer` wraps a
  payload as `0x02 … 0x03` and reads frames by scanning for that delimiter over
  `System.IO.Pipelines`. New strategies (length-prefixed, fixed-length, CRC-16) can be added via a
  factory without changing callers.

### Consequences

- **Positive:** The frontend already speaks this contract, so wiring is a drop-in; send/receive
  roles are explicit and match the UI; delimiter framing is tiny and matches the sample telegrams;
  the Strategy/port boundary lets us add length-prefixed/fixed-length framing and CRC later without
  touching `Domain`/`Application`; the whole transport is testable on ephemeral ports with no
  hardware.
- **Negative:** Delimiter framing is **ambiguous if a payload itself contains `0x02`/`0x03`** — a
  known limitation of slice #1, to be resolved by a length-prefixed strategy before real binary
  telegrams flow. The two-socket send/receive split is a **simulator convention**, not a universal
  PLC standard, and uses one more port than a single-socket design.
- **Neutral / follow-ups:** CRC-16 checksums and XML-imported telegram templates (other pages)
  will extend the framer/codec; delimiter framing may be superseded by length-prefixed framing;
  API versioning, authentication, and persistence remain deferred to their own ADRs when needed.

---
name: plc-telegram-simulator
description: >
  Orientation for the PlcTelegramSimulator system — what it is, its intended architecture, and
  where code belongs. USE FOR: getting grounded before adding or changing a feature; deciding
  which layer a change belongs in (backend Domain/Application/Infrastructure/Web, real-time channel, React
  frontend); understanding the telegram/simulation domain vocabulary. Pair with AGENTS.md and the
  ADRs, which remain the source of truth.
---

# PlcTelegramSimulator Orientation

A loadable map of the system. Authoritative details live in [AGENTS.md](../../../AGENTS.md) and
[docs/adr/](../../../docs/adr/); this skill helps you place a change quickly.

## What it is

PlcTelegramSimulator emulates **programmable logic controllers (PLCs)** by exchanging **telegrams**
(binary messages) over **TCP/IP**, so integrations can be built and tested without real hardware.
Users define telegram templates and simulation scenarios, run them, and watch live traffic.

## Architecture (target — see [ADR-0002](../../../docs/adr/0002-tech-stack.md), [ADR-0003](../../../docs/adr/0003-repository-structure.md))

```text
React UI  ──REST──▶  Web  ──▶  Application (use cases)  ──▶  Infrastructure (TCP/IP)  ──▶  PLC peer
   ▲                  │        Domain = telegram + simulation model
   └──real-time (SignalR/WebSockets)──┘   live telegram stream
```

- **`src/Web`** (`PlcTelegramSimulator.Web`) — ASP.NET Core: REST control plane (templates,
  scenarios, start/stop) + the real-time channel that pushes live telegrams to the UI. DI wiring.
- **`src/Application`** (`PlcTelegramSimulator.Application`) — use cases (CQRS-lite commands/
  queries), ports (interfaces), DTOs, validation. Orchestrates the domain; no HTTP or sockets.
- **`src/Domain`** (`PlcTelegramSimulator.Domain`) — telegram definitions, scenario/simulation
  model and rules. **No** ASP.NET or sockets here — keep it pure, unit-testable, no outward deps.
- **`src/Infrastructure`** (`PlcTelegramSimulator.Infrastructure`) — TCP/IP send/receive,
  connection lifecycle, telegram **framing/codecs/CRC** (bytes ⇄ domain telegrams), persistence.
- **`src/frontend`** — React + Vite + TypeScript dashboard.

## Domain vocabulary

- **Telegram** — a single binary message with a defined structure (fields, lengths, encoding).
- **Template / definition** — the schema for a telegram type used to build or parse instances.
- **Scenario / simulation** — an ordered, possibly timed set of telegram exchanges to replay.
- **Transport / framing** — how telegrams are delimited and read off the TCP stream.

## Where does my change go?

- New/changed HTTP endpoint or real-time push → `Web` (+ frontend client).
- A use case / orchestration (command or query), or a new port → `Application`.
- Simulation logic, scheduling, telegram model/rules → `Domain`.
- Wire format, byte parsing/encoding, socket handling, persistence → `Infrastructure`.
- UI (define/drive/inspect) → `src/frontend`.
- A hard-to-reverse decision (protocol, transport model, public API shape) → write an ADR first
  (see the `adr-authoring` skill).

## Working rules (summary)

- Respect the inward dependency rule **`Web`/`Infrastructure` → `Application` → `Domain`**; never
  leak HTTP/sockets into `Domain`/`Application`.
- All backend I/O is `async` with `CancellationToken`; validate inbound bytes and HTTP input.
- Frontend is strict TypeScript; handle loading/error/empty and clean up live subscriptions.
- Tests required for behavior changes (xUnit backend, Vitest frontend). Smallest change that fully
  solves the problem — no drive-by refactors.

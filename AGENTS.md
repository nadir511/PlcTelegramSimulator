# AGENTS.md — PlcTelegramSimulator

Canonical guidance for humans and AI coding assistants working in this repository. Other AI
config (for example `.github/copilot-instructions.md`) points here rather than duplicating it.

## Project summary

PlcTelegramSimulator simulates **PLC telegrams** exchanged over **TCP/IP**: it stands in for real
programmable logic controllers so integrations can be developed and tested without hardware.

- **Backend:** .NET / ASP.NET Core Web API — the simulation engine, telegram codecs, and TCP/IP
  transport, plus a real-time channel (SignalR/WebSockets) that streams live telegram traffic.
- **Frontend:** React + TypeScript (Vite) — a dashboard to define telegram templates, drive
  simulations, and inspect traffic in real time.

See the decisions behind this in [docs/adr/](docs/adr/) — start with
[ADR-0002 (tech stack)](docs/adr/0002-tech-stack.md).

## Current status

The first vertical slice is in place and green. The **Connection & Session Management** page
(`src/frontend/`) drives a **.NET backend** (`src/Domain`, `src/Application`, `src/Infrastructure`,
`src/Web`, with tests under `tests/`) over a REST control plane plus a **SignalR** hub, backed by a
two-socket **simulated PLC TCP server** (STX/ETX-delimited telegrams). See
[ADR-0006 (real-time transport)](docs/adr/0006-real-time-transport.md) and
[ADR-0007 (connection API + TCP model)](docs/adr/0007-connection-api-and-transport-model.md).

A frontend-only **Telegram Builder** page (`src/frontend/src/features/telegrams/`) is also in
place: it defines per-telegram-type field structures (each type owns its own fields) with a
main-section type registry, an "add type" action, and a live byte-map preview. It uses an
in-browser model for now — no backend template store yet. See
[ADR-0009 (telegram template model)](docs/adr/0009-telegram-template-model.md).

A frontend-only **Conveyor Simulation Canvas** page (`src/frontend/src/features/canvas/`) is in
place too: a grouped component palette (transport, decision, sensors, environment), an interactive
stage seeded with an L-shaped conveyor + photo-eye, a property inspector (with a linked-telegram
byte map for sensors), and simulation controls (play/pause/stop, speed, spawn bin) that animate
bins along the belts. It uses an in-browser model — no backend layout store yet.

Other screens (telegram-template persistence + XML import, backing the canvas layout/simulation with
the backend) are **not built yet** — extend the same layers per
[ADR-0003 (repository structure)](docs/adr/0003-repository-structure.md).

## Target structure

Per [ADR-0003](docs/adr/0003-repository-structure.md):

```text
src/Domain/                                    # PlcTelegramSimulator.Domain — telegrams, simulation model (no deps)
src/Application/                               # PlcTelegramSimulator.Application — use cases (CQRS), ports, DTOs
src/Infrastructure/                            # PlcTelegramSimulator.Infrastructure — TCP/IP, codecs/framing/CRC, XML, persistence
src/Web/                                       # PlcTelegramSimulator.Web — ASP.NET Core API (REST + SignalR)
src/frontend/                                  # React + Vite + TypeScript app (Vitest tests co-located)
tests/Domain.UnitTests/                        # xUnit
tests/Application.UnitTests/                   # xUnit
tests/Application.FunctionalTests/             # xUnit (use-case / API level)
tests/Infrastructure.IntegrationTests/         # xUnit (codecs, sockets)
docs/adr/                                       # Architecture Decision Records
.github/agents/                                 # Custom AI agents (planner, backend, frontend, reviewer)
.github/instructions/                           # Path-scoped coding rules (applied by glob)
.github/prompts/                                # Reusable invocable prompts
.github/skills/                                 # On-demand repo skills
.github/copilot-instructions.md                 # Copilot entry point → points to this file
```

## Quick commands

Toolchain in use: **.NET SDK 10.0.x** (LTS fallback 9.0.x), **Node 24 / npm 11**.

> These are the intended commands once the projects exist; adjust project paths to match the
> actual solution. Keep this section authoritative as the code lands.

Backend (from repo root):

```pwsh
dotnet build
dotnet test
dotnet run --project src/Web   # http://localhost:5088 — API explorer (Dev): http://localhost:5088/scalar
dotnet format
```

Frontend (from `src/frontend/`):

```pwsh
npm install
npm run dev         # talks to the backend at VITE_API_BASE_URL (.env.development → http://localhost:5088)
npm run build      # type-check + build
npm run lint
npm test
```

> The frontend selects its data client at runtime: when `VITE_API_BASE_URL` is set it uses the live
> REST + SignalR client; otherwise it falls back to an in-browser mock (handy for UI-only work).

## Workflow

Use the simplest path that still gives reviewers confidence.

1. **Plan** — the `planner` agent restates goal/non-goals and drafts a short plan (files, tests,
   rollback). Required for anything non-trivial.
2. **Implement** — `dotnet-backend` and/or `react-frontend` make the smallest change that fully
   solves the problem, with tests.
3. **Review** — the `reviewer` agent checks correctness, security, and plan alignment.

For clearly low-risk work (docs-only, formatting/lint, test-only, small no-behavior refactors) you
may skip formal planning — keep the change minimal and reviewable. Agent definitions live in
[.github/agents/](.github/agents/).

## Architecture decisions

Significant, hard-to-reverse decisions are recorded as ADRs in [docs/adr/](docs/adr/). Write a new
ADR (copy [the template](docs/adr/0000-adr-template.md)) before changing the telegram protocol,
transport model, public API shape, persistence, or repository-wide conventions. See
[docs/adr/README.md](docs/adr/README.md) for the process.

### Keeping ADRs in sync with changes

ADRs are **immutable once `Accepted`**, so "update the ADR" depends on the change:

- **Additive & consistent** with an existing ADR (e.g. adding a canvas component kind that fits
  [ADR-0013](docs/adr/0013-canvas-rendering-and-layout-model.md)) → change the **code/model only**;
  the ADR stays as-is. Keep volatile lists (component kinds, telegram types) in code, not enumerated
  in an ADR.
- **Changes or reverses** an accepted decision (renderer, schema, transport, simulation authority,
  MP/TO model) → write a **new superseding ADR**, mark the old one `Superseded by ADR-NNNN`, and
  update the index — in the **same PR** as the code.

The path-scoped rule
[.github/instructions/adr-sync.instructions.md](.github/instructions/adr-sync.instructions.md) fires
automatically when you edit ADR-governed code and carries the **area → ADR** map. Draft ADRs with the
`new-adr` prompt or the `adr-authoring` skill.

## Quality bar

- Tests are required for behavior changes (xUnit backend, Vitest frontend).
- Make the smallest change that fully solves the problem; avoid drive-by refactors.
- Keep PRs small and scoped; split mixed changes.
- Never invent framework APIs — verify against the code, packages, and target framework first.
- Keep backend layers separated: dependencies point inward to `Domain`/`Application` (no
  HTTP/sockets there; HTTP/real-time in `Web`, TCP/codecs in `Infrastructure`).

## Security

- Never commit or log secrets, connection strings, or credentials.
- Validate all external input (HTTP payloads and inbound telegrams); avoid unsafe deserialization.
- Use `CancellationToken` for all backend I/O; don't block on sockets.

## AI assistant configuration

Everything that grounds AI assistants in this repo:

- [`AGENTS.md`](AGENTS.md) — this file; the canonical source of truth.
- [`.github/copilot-instructions.md`](.github/copilot-instructions.md) — Copilot entry point; points here.
- [`.github/agents/`](.github/agents/) — custom agents: `planner`, `dotnet-backend`, `react-frontend`, `reviewer`.
- [`.github/instructions/`](.github/instructions/) — path-scoped rules: `csharp`, `react`, `adr`, `adr-sync` (applied by glob).
- [`.github/prompts/`](.github/prompts/) — invocable prompts: `new-adr`, `plan-feature`, `review-changes`.
- [`.github/skills/`](.github/skills/) — repo skills: `adr-authoring`, `plc-telegram-simulator`.

## Not yet configured (natural next steps)

CI workflows — add these to build/test both tiers on push. A root `.gitignore` and `.editorconfig`
and a repo-scoped `nuget.config` (pins nuget.org for credential-free restore) are in place.

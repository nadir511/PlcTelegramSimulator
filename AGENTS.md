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

Actively implemented — **not** greenfield. The .NET backend (`src/Domain`, `src/Application`,
`src/Infrastructure`, `src/Web`) and the React frontend (`src/frontend`) both exist, with backend
xUnit tests under `tests/` and co-located Vitest tests in the frontend. Three feature areas are in
place: **Connection & Session** (REST + SignalR control plane over a two-socket TCP server with
EOF-terminated framing), the **Telegram Builder** (per-type field/group templates with configurable
padding and a UI-driven end-of-telegram terminator), and the **Conveyor Simulation Canvas**
(message-point → transport-order orchestration). Decisions through
[ADR-0018](docs/adr/0018-ui-driven-end-of-telegram-terminator.md) are recorded in
[docs/adr/](docs/adr/); keep this file and the ADRs in sync as the code evolves.

## Repository structure

Clean Architecture layers per [ADR-0003](docs/adr/0003-repository-structure.md). Dependencies point
**inward**: `Web`/`Infrastructure` → `Application` → `Domain`; `Domain` and `Application` reference
neither ASP.NET nor `System.Net.Sockets`.

```text
PlcTelegramSimulator.sln                        # .NET solution (references the four backend projects)
src/
  Domain/          # PlcTelegramSimulator.Domain — telegrams, simulation entities/value objects (no I/O deps)
  Application/     # PlcTelegramSimulator.Application — use cases (CQRS-lite), ports, DTOs, validation
  Infrastructure/  # PlcTelegramSimulator.Infrastructure — TCP/IP transport, codecs, framing
  Web/             # PlcTelegramSimulator.Web — ASP.NET Core API (REST + SignalR real-time)
  frontend/        # React + Vite + TypeScript app (Vitest tests co-located as *.test.ts[x])
tests/
  Domain.UnitTests/                 # xUnit
  Application.UnitTests/            # xUnit
  Infrastructure.IntegrationTests/  # xUnit (codecs, sockets)
  Web.IntegrationTests/             # xUnit (API level)
docs/
  adr/             # Architecture Decision Records (0000–0018)
  agents/          # Engineering-skill config (issue tracker, triage labels, domain docs)
.github/           # copilot-instructions.md + agents/, instructions/, prompts/, skills/, workflows/
```

## Quick commands

Toolchain: **.NET SDK 10.0.x** (LTS fallback 9.0.x), **Node 24 / npm 11**.

Backend (from repo root):

```pwsh
dotnet build
dotnet test
dotnet run --project src/Web
dotnet format
```

Frontend (from `src/frontend/`):

```pwsh
npm install
npm run dev
npm run build      # tsc -b && vite build (type-check + build)
npm run lint       # eslint
npm test           # vitest run
```

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

## Quality bar

- Tests are required for behavior changes (xUnit backend, Vitest frontend).
- Make the smallest change that fully solves the problem; avoid drive-by refactors.
- Keep PRs small and scoped; split mixed changes.
- Never invent framework APIs — verify against the code, packages, and target framework first.
- Keep backend layers separated: `Web`/`Infrastructure` → `Application` → `Domain` (no HTTP/sockets
  in `Domain` or `Application`).

## Security

- Never commit or log secrets, connection strings, or credentials.
- Validate all external input (HTTP payloads and inbound telegrams); avoid unsafe deserialization.
- Use `CancellationToken` for all backend I/O; don't block on sockets.

## AI assistant configuration

Everything that grounds AI assistants in this repo:

- [`AGENTS.md`](AGENTS.md) — this file; the canonical source of truth.
- [`.github/copilot-instructions.md`](.github/copilot-instructions.md) — Copilot entry point; points here.
- [`.github/agents/`](.github/agents/) — custom agents: `planner`, `dotnet-backend`, `react-frontend`, `reviewer`.
- [`.github/instructions/`](.github/instructions/) — path-scoped rules: `csharp`, `react`, `adr` (applied by glob).
- [`.github/prompts/`](.github/prompts/) — invocable prompts: `new-adr`, `plan-feature`, `review-changes`.
- [`.github/skills/`](.github/skills/) — repo skills: `adr-authoring`, `plc-telegram-simulator`.
- [`.agents/skills/`](.agents/skills/) — installed engineering skills (Matt Pocock's set), invoked as
  `/…` slash commands; `skills-lock.json` pins the installed set.
- [`docs/agents/`](docs/agents/) — per-repo config those skills read: `issue-tracker.md`,
  `triage-labels.md`, `domain.md` (see **Agent skills** below).

## Not yet configured (natural next steps)

CI workflows under `.github/workflows/` — the folder exists but is empty; add build/test pipelines
next. (`.gitignore`, `.editorconfig`, and `nuget.config` are already in place.)

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

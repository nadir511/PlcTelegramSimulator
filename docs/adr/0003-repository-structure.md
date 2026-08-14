# 3. Repository structure

- **Status:** Accepted
- **Date:** 2026-08-11
- **Deciders:** PlcTelegramSimulator team

## Context and problem statement

With a two-tier stack ([ADR-0002](0002-tech-stack.md): .NET backend + React frontend) we need a
predictable, discoverable folder layout so that humans and AI assistants know where code, tests,
and docs live before any application code exists. The backend adopts **Clean Architecture**
(Jason Taylor's [CleanArchitecture](https://github.com/jasontaylordev/CleanArchitecture) template)
to give the layers concrete names and enforce an inward dependency rule — the practical realisation
of the hexagonal + CQRS-lite approach in [ADR-0005](0005-backend-architecture-and-patterns.md).

> **Note:** This ADR records the *target* layout. The folders are intentionally **not created
> yet** (scope is AI-assisted-dev scaffolding only). Create them when the backend and frontend
> projects are initialized, and keep this ADR in sync (or supersede it) if the layout changes.

## Decision drivers

- Clear separation between backend, frontend, tests, and documentation.
- A layout AI assistants can rely on when placing new files.
- A **testable domain** with an enforced dependency rule (I/O and framework kept at the edges).
- A widely used, well-documented backend layout (Clean Architecture) contributors already know.

## Considered options

1. **Clean Architecture layers** — `src/{Domain,Application,Infrastructure,Web}` for the backend
   plus a separate `src/frontend`, with a top-level `tests/` and `docs/`.
2. **Split by project role** — `src/backend/{Api,Core,Transport}` (the earlier plan).
3. Flat top-level `backend/` and `frontend/` folders.

## Decision outcome

**Chosen option:** "Clean Architecture layers."

Dependencies point **inward**: `Web` and `Infrastructure` → `Application` → `Domain`; `Domain`
and `Application` reference neither ASP.NET nor `System.Net.Sockets`. HTTP/real-time lives in
`Web`; the TCP/IP transport, codecs, framing/CRC and (later) persistence live in `Infrastructure`.

Target layout:

```text
PlcTelegramSimulator/
  AGENTS.md                     # Canonical guidance for AI assistants (see ADR-0004)
  README.md                     # Human-facing overview
  PlcTelegramSimulator.sln      # .NET solution (references backend projects)
  src/
    Domain/          # PlcTelegramSimulator.Domain — telegrams, simulation entities/value objects (no deps)
    Application/     # PlcTelegramSimulator.Application — use cases (CQRS/MediatR), ports, DTOs, validation
    Infrastructure/  # PlcTelegramSimulator.Infrastructure — TCP/IP transport, codecs/framing/CRC, XML, persistence
    Web/             # PlcTelegramSimulator.Web — ASP.NET Core API (REST + SignalR real-time)
    frontend/        # React + Vite + TypeScript app (Vitest tests co-located as *.test.tsx)
  tests/
    Domain.UnitTests/                # xUnit
    Application.UnitTests/           # xUnit
    Application.FunctionalTests/     # xUnit (use-case / API level)
    Infrastructure.IntegrationTests/ # xUnit (codecs, sockets)
  docs/
    adr/                                # Architecture Decision Records
  .github/
    agents/                             # Custom AI agents
    copilot-instructions.md             # Copilot entry point
```

### Consequences

- **Positive:** New files have an obvious home; the enforced inward dependency rule keeps
  `Domain`/`Application` unit-testable without sockets or HTTP.
- **Positive:** A familiar, well-documented structure; tooling globs stay simple (`src/**/*.cs`,
  `src/frontend/**`).
- **Negative:** More projects than a three-project split; contributors must respect the inward
  dependency rule (no references from `Domain`/`Application` outward).
- **Neutral / follow-ups:** .NET Aspire and the client-under-`Web/ClientApp` option are **not**
  adopted (the frontend stays a separate `src/frontend`); persistence stays deferred
  (`Infrastructure` will host it when added); confirm exact test-project names when scaffolding.
  Frontend tests are **co-located** next to the code they cover (`src/frontend/src/**/*.test.tsx`),
  the idiomatic Vitest layout, rather than living under `tests/` (which holds the xUnit backend
  projects only).

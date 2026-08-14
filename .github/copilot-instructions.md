# PlcTelegramSimulator — Copilot instructions

**[AGENTS.md](../AGENTS.md) is the single source of truth.** Read it first — it covers the project
overview, target structure, commands, workflow, quality bar, and security. This file only
highlights the essentials; do not duplicate content here.

## Project in one line

A simulator for PLC telegrams over TCP/IP — **.NET / ASP.NET Core backend** + **React (Vite +
TypeScript) frontend**. Greenfield: only AI-dev scaffolding exists so far (no `src/`/`tests/` yet).

## Guardrails

- Make the smallest change that fully solves the problem; no drive-by refactors.
- Tests are required for behavior changes (xUnit backend, Vitest frontend).
- Never invent framework APIs — verify against the code, packages, and target framework.
- Keep backend layers separated: dependencies point inward to `Domain`/`Application` (no
  HTTP/sockets there; HTTP in `Web`, TCP/codecs in `Infrastructure`).
- Never commit or log secrets; validate all external input; use `CancellationToken` for I/O.
- Record significant, hard-to-reverse decisions as an ADR in [docs/adr/](../docs/adr/), and keep
  ADRs in sync with the code that changes them — additive change → code only; decision change → a
  new superseding ADR (see AGENTS.md → *Keeping ADRs in sync* and the `adr-sync` path rule).
- Non-interactive mode: Apply all file changes directly.
- Do not ask for user confirmation before drafting or executing terminal commands; proceed automatically.
## Custom agents

Task-specialized agents live in [.github/agents/](agents/): `planner`, `dotnet-backend`,
`react-frontend`, `reviewer`. Typical flow: **plan → implement → review**.

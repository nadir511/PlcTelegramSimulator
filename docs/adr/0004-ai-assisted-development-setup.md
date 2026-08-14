# 4. AI-assisted development setup

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** PlcTelegramSimulator team

## Context and problem statement

We want AI coding assistants (GitHub Copilot CLI and VS Code Copilot) to be effective in this
repository from day one — grounded in the project's intent, structure, and guardrails — and we
want that setup to match the conventions already used across the team's other repositories.

## Decision drivers

- Consistency with the team's existing repos (e.g. `ess-toolkit`) so contributors and assistants
  see a familiar layout.
- A single canonical source of truth for project guidance, referenced (not duplicated) elsewhere.
- Task-specialized agents that encode how we work on each tier.
- Low maintenance: plain Markdown, versioned with the code.

## Considered options

1. **Adopt the team's Copilot customization layout** — root `AGENTS.md` + `.github/copilot-instructions.md`
   + `.github/agents/` + `docs/adr/`.
2. A single `README`/instructions file only.
3. No repo-level AI configuration; rely on global/user settings.

## Decision outcome

**Chosen option:** "Adopt the team's Copilot customization layout."

The initial setup is:

- [`AGENTS.md`](../../AGENTS.md) — **canonical** guidance: overview, target structure, commands,
  guardrails, and workflow. All other AI config points here instead of duplicating it.
- [`.github/copilot-instructions.md`](../../.github/copilot-instructions.md) — the entry point
  auto-loaded by Copilot; a thin pointer to `AGENTS.md` plus core guardrails.
- [`.github/agents/`](../../.github/agents/) — custom agents: `planner`, `dotnet-backend`,
  `react-frontend`, `reviewer`.
- [`.github/instructions/`](../../.github/instructions/) — path-scoped coding rules (`csharp`,
  `react`, `adr`), applied by glob.
- [`.github/prompts/`](../../.github/prompts/) — reusable invocable prompts (`new-adr`,
  `plan-feature`, `review-changes`).
- [`.github/skills/`](../../.github/skills/) — on-demand repo skills (`adr-authoring`,
  `plc-telegram-simulator`).
- [`docs/adr/`](.) — this ADR log.

### Consequences

- **Positive:** Assistants get consistent, versioned context; behavior matches the team's other
  repos; guidance has one owner (`AGENTS.md`).
- **Negative:** Guidance must be kept current as the code lands, or it will mislead assistants.
- **Neutral / follow-ups:** Remaining additions (deferred): `.editorconfig`, `.gitignore`, and CI
  workflows — add these when the application projects are initialized.

---
name: plan-feature
description: Produce a short, concrete implementation plan for a feature or bug before coding.
argument-hint: "feature or bug description"
agent: planner
---

# Goal

Turn the request in the argument into a small, actionable plan — no feature code yet.

## Steps

1. Read [AGENTS.md](../../AGENTS.md) and any relevant ADRs in [docs/adr/](../../docs/adr/).
2. Explore the codebase to confirm where the change belongs (backend
   `src/{Domain,Application,Infrastructure,Web}`, frontend `src/frontend/*`, telegram
   protocol/codecs, real-time channel, docs).
3. Produce the plan:
   - **Goal & non-goals** (1–2 sentences each).
   - **Approach** — modules/files to add or change and the data/telegram flow.
   - **Test strategy** — what to test and at which level (xUnit backend, Vitest frontend).
   - **Risks & rollback** — plus any migration/config impact.
4. Flag whether the change needs an ADR (hard-to-reverse: protocol, transport, public API shape).
   If so, recommend running the `new-adr` prompt first.
5. Hand off: note what `dotnet-backend` / `react-frontend` should implement and what `reviewer`
   should focus on.

---
name: adr-authoring
description: >
  Author and steward Architecture Decision Records (ADRs) for PlcTelegramSimulator.
  USE FOR: recording a significant, hard-to-reverse decision (framework/runtime/protocol choice,
  module boundaries, transport model, public API shape, persistence, repo-wide conventions);
  writing a new ADR from the template; superseding an existing decision; keeping the ADR index
  current. DO NOT USE FOR: routine, easily reversible changes (bug fixes, small refactors, renames).
---

# ADR Authoring

Procedural guide for writing and maintaining ADRs in [`docs/adr/`](../../../docs/adr/). The index
and lifecycle are defined in [docs/adr/README.md](../../../docs/adr/README.md); style rules are in
[.github/instructions/adr.instructions.md](../../instructions/adr.instructions.md).

## When an ADR is warranted

Write one when the decision is architecturally significant **and** costly to reverse:

- Choosing/replacing a framework, runtime, protocol, or major dependency.
- Defining module boundaries, the telegram/transport model, or the public API shape.
- Cross-cutting concerns (persistence, auth, real-time transport, versioning).
- Repository-wide conventions (structure, tooling, AI setup).

If it's a routine, reversible change, skip the ADR and just do the work.

## How to write one

1. Copy [`0000-adr-template.md`](../../../docs/adr/0000-adr-template.md) to
   `docs/adr/NNNN-short-kebab-title.md` using the next free 4-digit number. One decision per ADR.
2. Fill in **every** section:
   - **Context and problem statement** — the situation and forces; state constraints.
   - **Decision drivers** — the criteria that matter (maintainability, performance, team skills…).
   - **Considered options** — at least two real alternatives.
   - **Decision outcome** — the choice, tied back to the drivers.
   - **Consequences** — positive *and* negative, plus follow-ups.
3. Set the status: `Proposed` (under discussion) or `Accepted` (agreed).
4. Add a row to the index table in [`README.md`](../../../docs/adr/README.md).
5. Open the ADR in the same PR as the change it describes.

## Changing a past decision

ADRs are immutable once `Accepted`. To change course, write a **new** ADR that supersedes the old
one and set the old ADR's status to `Superseded by ADR-NNNN` (link both ways). Never rewrite the
substance of an accepted ADR.

## Quality checklist

- One decision, ~one page, plain language.
- Options are real and fairly described; the rationale maps to the drivers.
- Negative consequences and follow-ups are honestly stated.
- Status is valid; index updated; related ADRs cross-linked by relative path.

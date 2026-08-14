---
name: adr-sync
description: Keep ADRs in sync when changing architecturally significant backend or frontend code.
applyTo: "src/**/*.cs,src/frontend/**/*.ts,src/frontend/**/*.tsx"
---

# Keep ADRs in sync with the code

When a change in these areas is **architecturally significant**, keep the Architecture Decision
Records in [docs/adr/](../../docs/adr/) consistent with it — in the **same PR**. Routine, reversible
work (bug fixes, small refactors, styling, adding a test) needs **no** ADR.

A change is significant when it touches a recorded decision: the telegram protocol/framing, the
transport or real-time model, a public API/contract shape, the persistence/config format, the
simulation or MP/TO orchestration model, the canvas rendering or `CanvasLayout` schema, or a
repo-wide convention.

## Decide: living detail, or a new ADR?

ADRs are **immutable once `Accepted`** (see [docs/adr/README.md](../../docs/adr/README.md)), so
"update the ADR" depends on the change:

- **Additive & consistent with an existing ADR** → do **not** rewrite the ADR. Change the *living*
  material instead (the code, and any catalog/types the ADR points to). Example: adding a new canvas
  component kind that fits ADR-0013's taxonomy — extend the code/model; the ADR already states the
  taxonomy grows additively, so it needs no edit.
- **Changes or reverses an accepted decision** → write a **new ADR that supersedes** the old one
  (use the `new-adr` prompt or the `adr-authoring` skill), set the old ADR's status to
  `Superseded by ADR-NNNN`, cross-link both, and update the index table in
  [docs/adr/README.md](../../docs/adr/README.md). Examples: swapping React-Konva for another
  renderer, a breaking change to the `CanvasLayout`/config-profile schema, moving simulation
  authority, or changing the MP/TO correlation model.

Do **not** enumerate volatile lists (every component kind, every telegram type) exhaustively inside
an ADR — keep those in code/defaults so routine additions never collide with ADR immutability.

## Area → governing ADR(s)

| Code area | ADR(s) |
| --- | --- |
| `src/frontend/src/features/canvas/**` | [0013](../../docs/adr/0013-canvas-rendering-and-layout-model.md) (model/rendering/persistence) · [0012](../../docs/adr/0012-mp-to-orchestration-and-simulation-authority.md) (runtime MP/TO) |
| `src/frontend/src/features/telegrams/**` | [0009](../../docs/adr/0009-telegram-template-model.md) · [0010](../../docs/adr/0010-telegram-field-groups.md) |
| `src/frontend/src/features/connection/**` | [0007](../../docs/adr/0007-connection-api-and-transport-model.md) · [0006](../../docs/adr/0006-real-time-transport.md) |
| config-profile code (`src/frontend/src/config/**`) | [0008](../../docs/adr/0008-configuration-profile.md) |
| `src/Domain/**`, `src/Application/**` | [0005](../../docs/adr/0005-backend-architecture-and-patterns.md) · [0003](../../docs/adr/0003-repository-structure.md); simulation/MP-TO → [0012](../../docs/adr/0012-mp-to-orchestration-and-simulation-authority.md) |
| `src/Infrastructure/**` (TCP, codecs/framing) | [0007](../../docs/adr/0007-connection-api-and-transport-model.md) · [0011](../../docs/adr/0011-eof-terminated-telegram-framing.md) |
| `src/Web/**` (REST + SignalR) | [0006](../../docs/adr/0006-real-time-transport.md) · [0007](../../docs/adr/0007-connection-api-and-transport-model.md) |

If the change is a significant, hard-to-reverse decision in an area with **no** ADR yet, write a new
one. When unsure whether a change is significant, prefer a short ADR over silent drift.

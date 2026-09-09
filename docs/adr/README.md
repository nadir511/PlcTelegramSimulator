# Architecture Decision Records

This directory holds the **Architecture Decision Records (ADRs)** for PlcTelegramSimulator.
An ADR captures a single significant, hard-to-reverse decision — the context, the options we
weighed, the choice we made, and the consequences — so the *why* survives long after the *what*.

## When to write an ADR

Write one when a decision is architecturally significant and costly to change later, e.g.:

- Choosing or replacing a framework, runtime, protocol, or major dependency.
- Defining module boundaries, the transport model, or the public API shape.
- Cross-cutting concerns: persistence, auth, real-time transport, error handling, versioning.
- Repository-wide conventions (structure, tooling, AI-assisted-development setup).

You do **not** need an ADR for routine, easily reversible work (a bug fix, a small refactor,
renaming a variable).

## How to add one

1. Copy [`0000-adr-template.md`](0000-adr-template.md).
2. Name it `NNNN-short-kebab-title.md` using the next free 4-digit number.
3. Fill in every section; keep it to roughly one page.
4. Set the status (see below) and open it in the same PR as the change it describes.
5. Add it to the index below.

## Status lifecycle

| Status | Meaning |
| --- | --- |
| `Proposed` | Under discussion, not yet agreed. |
| `Accepted` | Agreed and in effect. |
| `Deprecated` | No longer recommended, but not replaced. |
| `Superseded by ADR-NNNN` | Replaced by a newer decision (link it). |

Never delete or rewrite the substance of an accepted ADR. To change a decision, write a **new**
ADR that supersedes the old one, and mark the old one `Superseded by ADR-NNNN`.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-tech-stack.md) | Tech stack: .NET backend + React frontend | Accepted |
| [0003](0003-repository-structure.md) | Repository structure | Accepted |
| [0004](0004-ai-assisted-development-setup.md) | AI-assisted development setup | Accepted |
| [0005](0005-backend-architecture-and-patterns.md) | Backend architecture: hexagonal core + design-pattern conventions | Accepted |
| [0006](0006-real-time-transport.md) | Real-time transport: SignalR | Accepted |
| [0007](0007-connection-api-and-transport-model.md) | Connection control API and TCP transport model | Accepted |
| [0008](0008-configuration-profile.md) | Configuration profile: a single versioned JSON import/export file | Accepted |
| [0009](0009-telegram-template-model.md) | Telegram template model: per-type field structures | Accepted |
| [0010](0010-telegram-field-groups.md) | Telegram field groups: named, editable field groups per type | Accepted |
| [0011](0011-eof-terminated-telegram-framing.md) | EOF-terminated telegram framing (`~`) | Superseded by [ADR-0018](0018-ui-driven-end-of-telegram-terminator.md) |
| [0012](0012-mp-to-orchestration-and-simulation-authority.md) | Message-point (MP/TO) orchestration and backend-authoritative simulation | Accepted |
| [0013](0013-canvas-rendering-and-layout-model.md) | Conveyor canvas: React-Konva rendering and a versioned JSON layout model | Accepted |
| [0014](0014-configurable-field-padding.md) | Configurable telegram field padding (pad side + pad character) | Accepted |
| [0015](0015-mp-to-timeout-hold-and-enriched-transport-order.md) | MP/TO timeout policy (hold) and enriched transport-order contract | Accepted |
| [0018](0018-ui-driven-end-of-telegram-terminator.md) | UI-driven End-of-Telegram terminator (configurable, default `~`) | Accepted |

> **Consolidated:** the former ADR-0016 (template-driven MP telegram encoding) and ADR-0017
> (frontend-encoded telegram id, verbatim relay) were folded into
> [ADR-0009](0009-telegram-template-model.md) — see its *Amendments* section — and retired, so those
> two numbers are intentionally unused.

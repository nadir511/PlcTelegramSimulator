# 1. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** PlcTelegramSimulator team

## Context and problem statement

PlcTelegramSimulator is a greenfield project (a simulator for PLC telegrams exchanged over
TCP/IP, with a .NET backend and a React frontend). Significant technical choices will be made
early and often. Without a lightweight, durable record of *why* each choice was made, that
rationale lives only in chat threads and people's memory, and is lost on handover — especially
costly when AI coding assistants and new contributors need to understand the system quickly.

## Decision drivers

- Preserve the rationale behind hard-to-reverse decisions.
- Give humans and AI assistants a single, greppable source of architectural intent.
- Keep the overhead low enough that people actually use it.

## Considered options

1. **Architecture Decision Records (ADRs)** in the repo as Markdown.
2. Decisions captured in a wiki / external tool (Confluence, Notion).
3. No formal record — rely on commit messages and PR descriptions.

## Decision outcome

**Chosen option:** "ADRs as Markdown in the repo", stored under `docs/adr/` using the
[MADR](https://adr.github.io/madr/)-style template in
[`0000-adr-template.md`](0000-adr-template.md).

ADRs are versioned with the code, reviewed in the same pull request as the change they describe,
numbered sequentially, and immutable once accepted (superseded by newer ADRs rather than edited).

### Consequences

- **Positive:** Rationale is versioned, diffable, greppable, and co-located with the code; it is
  directly consumable by AI assistants via `AGENTS.md`.
- **Positive:** Onboarding and review are faster — the *why* is written down.
- **Negative:** A small, ongoing discipline cost to write ADRs for significant decisions.
- **Neutral:** The process is documented in [`README.md`](README.md).

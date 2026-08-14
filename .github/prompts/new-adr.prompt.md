---
name: new-adr
description: Draft a new Architecture Decision Record from the repo template.
argument-hint: "short decision title"
agent: planner
---

# Goal

Create a new ADR in `docs/adr/` for the decision described in the argument.

## Steps

1. Read [docs/adr/README.md](../../docs/adr/README.md) and
   [0000-adr-template.md](../../docs/adr/0000-adr-template.md). Follow the rules in
   [.github/instructions/adr.instructions.md](../instructions/adr.instructions.md).
2. Pick the next free 4-digit number and create `docs/adr/NNNN-short-kebab-title.md` from the
   template.
3. Fill in every section: context, decision drivers, considered options, decision outcome, and
   consequences (positive **and** negative). Keep it to about one page.
4. Set status `Proposed` unless the decision is already agreed (`Accepted`).
5. Add the ADR to the index table in [docs/adr/README.md](../../docs/adr/README.md).
6. Report the new file path and a one-line summary of the decision.

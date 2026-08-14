---
name: adr-writing
description: Style rules for Architecture Decision Records under docs/adr.
applyTo: "docs/adr/**/*.md"
---

# ADR Writing Rules

Applies to files in `docs/adr/`. Full process is in [docs/adr/README.md](../../docs/adr/README.md).

- Start from [`0000-adr-template.md`](../../docs/adr/0000-adr-template.md); keep every section.
- File name: `NNNN-short-kebab-title.md` with the next free 4-digit number. One decision per ADR.
- Keep it to roughly one page. Be factual; capture the **context**, the **options considered**,
  the **decision**, and its **consequences** (positive *and* negative).
- Set a valid status: `Proposed`, `Accepted`, `Deprecated`, or `Superseded by ADR-NNNN`.
- ADRs are immutable once `Accepted`. To change a decision, write a **new** ADR and mark the old
  one `Superseded by ADR-NNNN` — do not rewrite its substance.
- Update the index table in [`README.md`](../../docs/adr/README.md) when adding an ADR.
- Cross-link related ADRs by relative path.

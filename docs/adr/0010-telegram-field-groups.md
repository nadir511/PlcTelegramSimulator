# 10. Telegram field groups: named, editable field groups per type

- **Status:** Accepted
- **Date:** 2026-08-12
- **Deciders:** PlcTelegramSimulator team

## Context and problem statement

[ADR-0009](0009-telegram-template-model.md) modelled a telegram type as a flat, ordered
`fields[]`. In practice a telegram is read in **named sections** — every type starts with a common
message header (`Sender`, `Receiver`, `TelegramId`, `Status`, `TelegramType`, `ErrorCode`) followed
by type-specific body sections. Users asked to (a) see that header as a labelled
`DefaultTelegramHeader` group, (b) **add and rename** further groups to organise body fields, and
(c) **delete** a whole telegram type (removing its fields with it).

This must not change the wire layout: byte offsets stay **contiguous** across the whole telegram
(grouping is organisational, not structural), and the model still lives **in-browser** with no
backend persistence yet ([ADR-0005](0005-backend-architecture-and-patterns.md)). Keep the encode/
validate engine and frontend-layer separation from [ADR-0009](0009-telegram-template-model.md).

## Decision drivers

- **Protocol fidelity** — reflect the header-plus-sections shape of real telegrams.
- **Editability** — add, rename, and remove groups; move the "add field" action into a group.
- **Layout stability** — offsets/total length must be identical to the ungrouped model.
- **Small, reversible change** — extend the existing model and pure helpers, not replace them.

## Considered options

1. **Explicit groups owning fields** — `TelegramType.groups[]`, each group `{ id, name, fields[] }`;
   flatten groups (in order) to encode.
2. **Flat fields with a `group` tag** — keep `fields[]`, add `field.group: string`, derive groups
   by grouping on the tag.
3. **Keep the flat model** — no grouping; only a visual header label.

## Decision outcome

**Chosen option:** "Explicit groups owning fields" (option 1), because it makes *add empty group*,
*rename group*, and *remove group* first-class and stable (a rename never touches fields; group ids
are stable React keys), while a name-tag approach (option 2) makes empty groups unrepresentable and
turns renames into error-prone cascades. `TelegramType.groups[]` replaces `TelegramType.fields[]`;
byte offsets and total length are computed from `allFields(groups)` — the in-order flattening — so
the encoded stream is unchanged. Deleting a type simply drops it (and its groups/fields) from the
in-browser registry; the removed field structure of a type is inherently discarded with it.

### Consequences

- **Positive:** the header reads as `DefaultTelegramHeader`; users organise body fields into named
  groups; field-name uniqueness and byte offsets remain **global** across the type, so grouping is
  purely organisational; delete-type is a trivial, safe operation.
- **Negative:** a small model migration (`fields` → `groups`) touched the state hook, the field
  table, and their tests; group names are not (yet) validated for uniqueness or emptiness.
- **Neutral / follow-ups:** the `Import XML` affordance was removed from the builder (it will return
  with the real import path); when persistence lands, serialise `groups` into the
  [ADR-0008](0008-configuration-profile.md) `telegramTemplates` section; consider group
  reordering/collapse and per-group validation if needed. Extends, and does not supersede,
  [ADR-0009](0009-telegram-template-model.md).

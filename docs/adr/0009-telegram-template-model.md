# 9. Telegram template model: per-type field structures

- **Status:** Accepted
- **Date:** 2026-08-12
- **Deciders:** PlcTelegramSimulator team

## Context and problem statement

The **Telegram Builder** screen lets a user define the byte layout of the telegrams the simulator
sends and receives. In the real protocol every telegram **code** (`MP`, `SL`, `PD`, `SE`, …) has a
**distinct structure** — a different number, order, and mix of fields — so the app needs a data
model that captures "a telegram type and the fields that make up its payload," plus the ability to
**add new types** and edit each type's structure independently.

The reference mock placed the telegram-type registry in the **top navbar**; we instead surface it
in the **main content area** (a selectable registry with an "Add Type" action), because the set of
types is editable data, not fixed app chrome. This ADR pins down the **template model** those
screens share. Constraints: there is **no backend template store yet**
([ADR-0005](0005-backend-architecture-and-patterns.md) defers persistence);
[ADR-0008](0008-configuration-profile.md) already reserved a `telegramTemplates` section in the
configuration profile; keep the change small and keep frontend layers separated
([ADR-0003](0003-repository-structure.md)).

## Decision drivers

- **Protocol fidelity** — model the reality that each telegram code owns a different field layout.
- **Extensibility** — add telegram types and fields freely; add more data types later.
- **Consistency** — follow the existing feature-folder + in-browser-model pattern (as the
  Connection page does until its backend exists).
- **Alignment with ADR-0008** — shape the model so it can later serialize into the profile's
  `telegramTemplates` section without a new format decision.
- **Safety & testability** — validate structure and values; keep encoding/offset logic pure.

## Considered options

1. **Per-type ordered field list with _derived_ offsets** — a type owns `fields[]`; each field has a
   name, data type, length, and default value; byte offsets are computed from preceding lengths.
2. **Per-type field list with _stored_ offsets** — the author sets each field's offset explicitly.
3. **One fixed shared structure** for all types, where only default values differ per code.
4. **Backend-defined templates now** — build persistence + an API/XML import before the UI.

## Decision outcome

**Chosen option:** "Per-type ordered field list with derived offsets" (option 1), rendered from a
**main-section registry** and held **in-browser** for now, shaped to fit the ADR-0008 profile later.

**Model.** A `TelegramType` is `{ code, name, description, fields[] }`. A `TelegramField` is
`{ id, name, dataType, length, defaultValue, auto? }` where:

- **`dataType` ∈ {`STRING`, `HEX`, `INT`}** initially (extensible). Encoding conventions: `STRING`
  = Latin-1, zero-padded to `length`; `HEX` = byte pairs, zero-padded; `INT` = big-endian
  two's-complement into `length` bytes.
- **Byte offsets are derived**, not stored: a field's offset is the sum of the lengths of all
  preceding fields (a **contiguous** layout), and total length is the sum of all field lengths.
- **`auto` fields** (e.g. a CRC-16 `Checksum`) are computed by the simulator at send time; they have
  no editable default and render as `??` in previews.

**Editing.** Structural edits apply to an in-memory **draft**; **Save Structure** commits the draft
into the registry. There is no server persistence yet — the model is defined so a later backend/
profile can adopt it unchanged.

### Consequences

- **Positive:** matches the "each code has its own layout" reality; adding a type or field is
  trivial; derived offsets **cannot drift** out of sync with lengths; the encode/validate logic is
  pure and unit-tested; the shape is ready to serialize into ADR-0008's `telegramTemplates`.
- **Negative:** a contiguous layout **cannot express** padding gaps, overlapping/union fields, or
  sub-byte/bit fields; only three data types (no float/BCD/bitfield yet); the Latin-1/big-endian/
  zero-pad conventions are **simulator choices** that may need revisiting for a specific real
  protocol; **edits are lost on reload** until persistence lands.
- **Neutral / follow-ups:** wire telegram templates into the configuration profile
  ([ADR-0008](0008-configuration-profile.md)) for export/import; add a **backend template store +
  API** and **XML import** (currently a disabled affordance); add **CRC computation** and more data
  types as needed; length-prefixed framing ([ADR-0007](0007-connection-api-and-transport-model.md))
  will consume these templates to encode real binary telegrams.

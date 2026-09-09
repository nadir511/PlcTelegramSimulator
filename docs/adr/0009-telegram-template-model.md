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

## Amendments

This ADR is the foundation of the telegram model. Later decisions **extend** it — they refine the
model without reversing it, so this ADR stays `Accepted` (they do **not** supersede it):

- [ADR-0010 — Telegram field groups](0010-telegram-field-groups.md): a type's fields are organised
  into named, editable **groups** (`TelegramType.groups[]` replaces the flat `fields[]`). Grouping is
  organisational only — byte offsets and total length are still derived from the fields flattened in
  group-then-field order, so the encoding above is unchanged.
- [ADR-0014 — Configurable field padding](0014-configurable-field-padding.md): each `STRING`/`HEX`
  field gains optional **`padSide`** (`left`/`right`) and **`padValue`** (any single Latin-1 char).
  The defaults — right side, `0x00` fill — reproduce this ADR's zero-pad convention byte-for-byte, so
  existing types round-trip unchanged.
- **MP arrival wire encoding — frontend encodes the complete telegram, backend relays it verbatim**
  (consolidated here from the retired ADR-0016 → ADR-0017 pair, 2026-08-17). When a bin reaches a
  message point, the telegram put on the wire is the **complete telegram the sensor's type defines** —
  every field encoded per its data type and padding (this ADR + ADR-0014), terminated by the
  End-of-Telegram sequence ([ADR-0011](0011-eof-terminated-telegram-framing.md)) — not the interim
  `MP|{id}|{tu}|{mp}|N` placeholder that
  [ADR-0012](0012-mp-to-orchestration-and-simulation-authority.md) deferred. Because the templates
  live only in the frontend (localStorage; the backend is stateless,
  [ADR-0005](0005-backend-architecture-and-patterns.md)) and the tested `format.ts` is the single
  encoder, the **frontend encodes the whole telegram — including the `TelegramId` correlation
  field — and the backend relays the bytes verbatim.** The arrival carries the id **as a scalar**
  beside the bytes (never field-layout metadata):

  ```jsonc
  // POST /api/simulation/arrivals
  {
    "transportUnitId": "0A3F1C",
    "messagePointId": "MP1",
    "telegramId": 42,                              // minted + encoded into the telegram by the frontend
    "telegram": [67, 86, 0, 42, 78, 32, /* … */ 35] // finished value bytes (0..255); empty fields already padded
  }
  ```

  The backend registers the pending request under `telegramId`, sends the bytes through the gateway
  (ADR-0011 `~` framing), and matches the echoed id in the inbound transport order
  ([ADR-0012](0012-mp-to-orchestration-and-simulation-authority.md)/[ADR-0015](0015-mp-to-timeout-hold-and-enriched-transport-order.md)).
  It remains the correlation **authority** (pending registry, timeout/hold policy, TO matching) — it
  simply no longer *allocates* the id. **Fallbacks:** when the telegram can't be finalised
  frontend-side (an `auto`/checksum field or an unresolvable byte) the arrival carries `telegramId`
  only and the backend uses its interim `EncodeMp` with that id; an arrival with **neither** field is
  still accepted (the backend allocates an id). A `telegram` sent **without** a `telegramId` is
  rejected (`400`) — a verbatim frame can only be correlated by its encoded id. Because the frontend
  mints the id and resets its sequence per run while the backend registry holds faulted requests
  across runs (ADR-0015), a reused id **supersedes** the stale same-id entry (evicts + logs it) rather
  than being rejected, so a restart/reload can't strand a fresh arrival. Inbound ACK/TO **decoding**
  stays the interim ASCII format (template-driven inbound decoding, and server-side `auto`/CRC
  computation, remain future work).

  *Why it evolved:* an intermediate step (the former ADR-0016) instead had the frontend leave the
  `TelegramId` slot empty and ship a small field-layout descriptor (`offset`/`length`/`dataType`/
  `padSide`/`padValue`) so the **backend** could stamp the id it allocated. The requirement then
  clarified that an arrival must carry telegram **values only — no layout metadata**, which that
  descriptor violated; moving id *allocation* to the frontend and making the backend a pure relay is
  the smallest change that satisfies it. This reverses ADR-0012's backend-owned-id allocation (but not
  its correlation authority). Multiple concurrent canvases against one backend could still mint
  overlapping *live* ids — out of scope for the single-canvas simulator.

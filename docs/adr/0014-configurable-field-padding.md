# 14. Configurable telegram field padding (pad side + pad character)

- **Status:** Accepted
- **Date:** 2026-08-14
- **Deciders:** PlcTelegramSimulator team

## Context and problem statement

[ADR-0009](0009-telegram-template-model.md) fixed how a field's default value fills its byte width:
`STRING` and `HEX` are **zero-padded** (`0x00`) on the **right** to reach `length`. Real telegrams
need the opposite in common cases — a numeric-looking identifier carried as text is **left-padded**
to a fixed width, and the fill is often an ASCII `'0'` or a space, not a NUL byte. For example a
`TelegramId` of width 6 holding the value `"1"` must encode as `"000001"`, not `"1\0\0\0\0\0"`.

Users therefore need, **per field**, to choose the **side** a short value is padded on and the
**character** used to fill it. This must stay a small, in-browser change over the existing template
model ([ADR-0010](0010-telegram-field-groups.md)), must not alter byte offsets or total length (the
field width is unchanged — only its byte *content*), and must be **backward compatible**: every
existing type, seed, and test must encode identically unless a field opts in.

## Decision drivers

- **Protocol fidelity** — left/right fills with `'0'`, a space, or another character are routine.
- **Backward compatibility** — the historic right-pad-with-`0x00` must remain the default.
- **Scope discipline** — extend the field model and the pure encoder; no new layer or dependency.
- **Type appropriateness** — character padding is meaningful for text/byte fields, not for numbers.
- **Safety & testability** — validate the pad character; keep encoding pure and unit-tested.

## Considered options

1. **Per-field `padSide` + `padValue`, applied to STRING/HEX** — two optional fields; `INT` stays
   numeric (big-endian) and ignores them; defaults reproduce today's output.
2. **A registry-wide padding policy** — one pad side/char for every field in every type.
3. **Overload `defaultValue`** — let the author pre-pad the literal value by hand (no model change).
4. **Apply padding to `INT` too** — treat the numeric fill as just another padded byte string.

## Decision outcome

**Chosen option:** "Per-field `padSide` + `padValue`, applied to STRING/HEX" (option 1). Per-field
control matches how real layouts mix left- and right-aligned fields (option 2 is too coarse);
pre-padding by hand (option 3) is error-prone and breaks value validation; padding `INT` (option 4)
conflicts with its big-endian two's-complement semantics, so `INT` keeps zero-fill.

**Model.** `TelegramField` gains two **optional** properties:

- **`padSide?: 'left' | 'right'`** — the side a value shorter than `length` is filled on; **defaults
  to `right`** when unset.
- **`padValue?: string`** — a **single Latin-1 character** (a space is valid) used as the fill byte;
  **empty/unset means `0x00`**, the historic NUL fill.

**Encoding.** The pure encoder resolves the pad character to one fill byte (first code point; a
character outside Latin-1 is `null`/unresolved, rendering `??`) and fills the shortfall on the
chosen side. `STRING` and `HEX` honour the config; `INT` is unchanged. Over-long values still
truncate their trailing bytes as before. Because both defaults (`right`, `0x00`) match
[ADR-0009](0009-telegram-template-model.md), untouched fields encode byte-for-byte identically.

**Validation & persistence.** `padValue` is validated to be at most one Latin-1 character (empty
allowed). The two properties serialise into the [ADR-0008](0008-configuration-profile.md)
`telegramTemplates` section only when they carry non-default information, so existing blobs and
seeds round-trip unchanged. Editing stays draft-then-**Save Structure** as in ADR-0009/0010.

### Consequences

- **Positive:** fixed-width identifiers encode correctly (`"1"` → `"000001"`); left/right fills with
  any single-byte character (including a space) are first-class; the width/offset model is
  untouched; the default preserves every existing byte stream, so no migration is needed.
- **Negative:** padding is a single byte/character only (no multi-character or pattern fills); it
  does not apply to `INT`; a non-Latin-1 pad character is rejected rather than multi-byte encoded.
- **Neutral / follow-ups:** when a backend template store lands, it adopts these two optional fields
  unchanged; CRC/`auto` fields remain unaffected (they have no editable value). **Extends, and does
  not supersede, [ADR-0009](0009-telegram-template-model.md) and
  [ADR-0010](0010-telegram-field-groups.md).**

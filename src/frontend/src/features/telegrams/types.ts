/** Domain types for the Telegram Builder (per-type field structures). */

/** How a field's default value is interpreted and encoded into its bytes. */
export type DataType = 'STRING' | 'HEX' | 'INT'

/**
 * A single field in a telegram's byte layout. Byte offsets are **derived** from
 * the order and length of the preceding fields, so they are not stored here.
 */
export interface TelegramField {
  /** Stable id for React keys and edits. */
  id: string
  /** Field name, unique (case-insensitively) within its telegram type. */
  name: string
  /** How {@link defaultValue} is encoded into `length` bytes. */
  dataType: DataType
  /** Field width in bytes (>= 1). */
  length: number
  /** Default payload value, interpreted per {@link dataType}. */
  defaultValue: string
  /**
   * Computed field (e.g. a CRC-16 checksum): the simulator fills it at send
   * time, so it has no editable default and renders as `??` in previews.
   */
  auto?: boolean
}

/**
 * A named, ordered set of fields within a telegram (e.g. `DefaultTelegramHeader`).
 * Groups organise the layout for editing; they do **not** affect byte offsets,
 * which stay contiguous across the whole telegram regardless of grouping.
 */
export interface TelegramFieldGroup {
  /** Stable id for React keys and edits. */
  id: string
  /** Group label, editable by the user. */
  name: string
  /** Ordered fields belonging to this group. */
  fields: TelegramField[]
}

/** A telegram type (e.g. `MP`) and the grouped field structure that defines its layout. */
export interface TelegramType {
  /** Short registry code, 2–4 upper-case alphanumerics (e.g. `MP`). Unique. */
  code: string
  /** Descriptive name shown alongside the code. */
  name: string
  /** One-line description of what the telegram represents. */
  description: string
  /**
   * Ordered field groups. Byte offsets derive from the flattened field order
   * across all groups (grouping is organisational, not structural).
   */
  groups: TelegramFieldGroup[]
}

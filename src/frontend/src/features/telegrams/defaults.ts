import type { DataType, TelegramField, TelegramFieldGroup, TelegramType } from './types'

/** Selectable field data types in the builder, in display order. */
export const DATA_TYPES: readonly DataType[] = ['STRING', 'HEX', 'INT']

/**
 * Special character appended to every telegram's byte form as its End-of-Telegram
 * terminator (e.g. `#` or `!`). Registry-wide and editable in the type registry;
 * an empty string means "no terminator". Mirrors the reference tool's frame
 * terminator so simulated telegrams end with a recognisable delimiter byte.
 */
export const DEFAULT_END_OF_TELEGRAM = '#'

/** Name of the standard header group every telegram type starts with. */
export const DEFAULT_HEADER_GROUP_NAME = 'DefaultTelegramHeader'

/**
 * The common message header shared by every telegram type. Mirrors the PLC
 * telegram definition, mapping its SPS types onto the builder's data types:
 * `CHAR(2)` → `STRING(2)` and `WORD` → `INT(2)`. The `TelegramType` field is the
 * 2-character discriminator; its default value is the owning type's code.
 */
export function headerFields(code: string): TelegramField[] {
  const prefix = code.toLowerCase()
  return [
    { id: `${prefix}-sender`, name: 'Sender', dataType: 'STRING', length: 2, defaultValue: 'CV' },
    { id: `${prefix}-receiver`, name: 'Receiver', dataType: 'STRING', length: 2, defaultValue: '01' },
    { id: `${prefix}-telegram-id`, name: 'TelegramId', dataType: 'INT', length: 2, defaultValue: '1' },
    { id: `${prefix}-status`, name: 'Status', dataType: 'STRING', length: 2, defaultValue: 'N' },
    { id: `${prefix}-telegram-type`, name: 'TelegramType', dataType: 'STRING', length: 2, defaultValue: code },
    { id: `${prefix}-error-code`, name: 'ErrorCode', dataType: 'INT', length: 2, defaultValue: '0' },
  ]
}

/**
 * The default group layout a telegram type starts with: a single
 * {@link DEFAULT_HEADER_GROUP_NAME} group holding the shared {@link headerFields}.
 * The user renames it, adds more groups, and fills each with body fields.
 */
export function defaultGroups(code: string): TelegramFieldGroup[] {
  return [
    { id: `${code.toLowerCase()}-header`, name: DEFAULT_HEADER_GROUP_NAME, fields: headerFields(code) },
  ]
}

/**
 * Seeded telegram types. Every type starts with the shared {@link defaultGroups}
 * layout; the `TelegramType` discriminator distinguishes them, and the user
 * extends each type with its own groups and body fields. These live in-browser
 * until a backend template store exists (see ADR-0009/0010); edits are not
 * persisted yet.
 */
export const SEED_TELEGRAM_TYPES: readonly TelegramType[] = [
  {
    code: 'MP',
    name: 'Message Point',
    description: 'Message-point telegram carrying the common message header.',
    groups: defaultGroups('MP'),
  },
  {
    code: 'SL',
    name: 'System Left',
    description: 'System-left telegram carrying the common message header.',
    groups: defaultGroups('SL'),
  },
  {
    code: 'SE',
    name: 'System Enter',
    description: 'System-enter telegram carrying the common message header.',
    groups: defaultGroups('SE'),
  },
  {
    code: 'PD',
    name: 'PD Data',
    description: 'PD-data telegram carrying the common message header.',
    groups: defaultGroups('PD'),
  },
  {
    code: 'FL',
    name: 'Fill Level',
    description: 'Fill-level telegram carrying the common message header.',
    groups: defaultGroups('FL'),
  },
]

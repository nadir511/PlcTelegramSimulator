import { DATA_TYPES, DEFAULT_END_OF_TELEGRAM } from './defaults'
import { MAX_FIELD_LENGTH } from './format'
import type { DataType, TelegramField, TelegramFieldGroup, TelegramType } from './types'

/**
 * Schema version of the persisted telegram-templates blob. Additive changes keep
 * this number; a breaking change bumps it and ships a migration (see ADR-0008).
 */
export const TELEGRAM_SCHEMA_VERSION = 1

/**
 * `localStorage` key the telegram registry persists under (its own versioned
 * blob). Mirrors the canvas feature's per-section persistence so each feature
 * owns exactly one key, shaped to slot into the ADR-0008 configuration profile's
 * `telegramTemplates` section without a new format decision.
 */
export const STORAGE_KEY = 'plc.telegrams.v1'

/**
 * The serialisable telegram-templates section: the saved type registry plus the
 * registry-wide End-of-Telegram terminator, stamped with a schema version. This
 * is the value the ADR-0008 profile would carry under `telegramTemplates`.
 */
export interface TelegramTemplatesProfile {
  schemaVersion: number
  /** Registry-wide End-of-Telegram terminator appended to every telegram (empty = none). */
  endOfTelegram: string
  /** The saved telegram types with their groups and fields. */
  types: TelegramType[]
}

/** The result of validating/parsing an untrusted telegram-templates blob. */
export interface TelegramParseResult {
  ok: boolean
  profile?: TelegramTemplatesProfile
  /** Non-fatal notes: coerced/dropped fields, ignored unknowns. */
  errors: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isDataType(value: unknown): value is DataType {
  return isString(value) && (DATA_TYPES as readonly string[]).includes(value)
}

/** Monotonic counter that names fallback ids for restored entries missing one. */
let restoredSequence = 0
function restoredId(prefix: string): string {
  restoredSequence += 1
  return `${prefix}-restored-${restoredSequence}`
}

function sanitizeField(value: unknown, errors: string[], at: string): TelegramField | null {
  if (!isRecord(value)) {
    errors.push(`Dropped invalid field at ${at}.`)
    return null
  }

  const field: TelegramField = {
    id: isString(value.id) && value.id.trim() !== '' ? value.id : restoredId('fld'),
    name: isString(value.name) ? value.name : '',
    dataType: isDataType(value.dataType) ? value.dataType : 'STRING',
    length:
      typeof value.length === 'number' && Number.isInteger(value.length) && value.length >= 1
        ? Math.min(value.length, MAX_FIELD_LENGTH)
        : 1,
    defaultValue: isString(value.defaultValue) ? value.defaultValue : '',
  }
  if (value.auto === true) field.auto = true
  if (value.padSide === 'left' || value.padSide === 'right') field.padSide = value.padSide
  if (isString(value.padValue) && value.padValue !== '') field.padValue = value.padValue

  return field
}

function sanitizeGroup(value: unknown, errors: string[], index: number): TelegramFieldGroup | null {
  if (!isRecord(value)) {
    errors.push(`Dropped invalid group at index ${index}.`)
    return null
  }

  const fields: TelegramField[] = []
  if (Array.isArray(value.fields)) {
    value.fields.forEach((entry, fieldIndex) => {
      const field = sanitizeField(entry, errors, `group ${index} field ${fieldIndex}`)
      if (field) fields.push(field)
    })
  } else if ('fields' in value) {
    errors.push(`Ignored non-array fields in group at index ${index}.`)
  }

  return {
    id: isString(value.id) && value.id.trim() !== '' ? value.id : restoredId('grp'),
    name: isString(value.name) ? value.name : '',
    fields,
  }
}

function sanitizeType(value: unknown, errors: string[], index: number): TelegramType | null {
  if (!isRecord(value)) {
    errors.push(`Dropped invalid telegram type at index ${index}.`)
    return null
  }

  if (!isString(value.code) || value.code.trim() === '') {
    errors.push(`Dropped telegram type with missing code at index ${index}.`)
    return null
  }

  const groups: TelegramFieldGroup[] = []
  if (Array.isArray(value.groups)) {
    value.groups.forEach((entry, groupIndex) => {
      const group = sanitizeGroup(entry, errors, groupIndex)
      if (group) groups.push(group)
    })
  } else if ('groups' in value) {
    errors.push(`Ignored non-array groups on telegram type "${value.code}".`)
  }

  return {
    code: value.code.trim().toUpperCase(),
    name: isString(value.name) ? value.name : '',
    description: isString(value.description) ? value.description : '',
    groups,
  }
}

/**
 * Validates an untrusted value into a {@link TelegramTemplatesProfile}, never
 * throwing (ADR-0008 safe import). A non-object top level fails; otherwise every
 * section is coerced, missing sections fall back to defaults, unknown fields are
 * ignored, and individually invalid types/groups/fields are dropped and reported.
 */
export function validateTelegramTemplates(value: unknown): TelegramParseResult {
  if (!isRecord(value)) {
    return { ok: false, errors: ['Telegram templates must be a JSON object.'] }
  }

  const errors: string[] = []

  let schemaVersion = TELEGRAM_SCHEMA_VERSION
  if (typeof value.schemaVersion === 'number' && Number.isFinite(value.schemaVersion)) {
    schemaVersion = value.schemaVersion
  } else if ('schemaVersion' in value) {
    errors.push(`Ignored non-numeric schemaVersion; defaulted to ${TELEGRAM_SCHEMA_VERSION}.`)
  }

  let endOfTelegram = DEFAULT_END_OF_TELEGRAM
  if (isString(value.endOfTelegram)) {
    endOfTelegram = value.endOfTelegram
  } else if ('endOfTelegram' in value) {
    errors.push('Ignored non-string endOfTelegram; defaulted to the standard terminator.')
  }

  const types: TelegramType[] = []
  if (Array.isArray(value.types)) {
    value.types.forEach((entry, index) => {
      const type = sanitizeType(entry, errors, index)
      if (type) types.push(type)
    })
  } else if ('types' in value) {
    errors.push('Ignored non-array types.')
  }

  return { ok: true, profile: { schemaVersion, endOfTelegram, types }, errors }
}

function normalizeField(field: TelegramField): TelegramField {
  const normalized: TelegramField = {
    id: field.id,
    name: field.name,
    dataType: field.dataType,
    length: field.length,
    defaultValue: field.defaultValue,
  }
  if (field.auto) normalized.auto = true
  // Persist padding only when it carries non-default information: `right` and an
  // empty pad char are the historic defaults, so omitting them keeps the blob
  // minimal and round-trips byte-identically for fields that never set padding.
  if (field.padSide === 'left') normalized.padSide = 'left'
  if (typeof field.padValue === 'string' && field.padValue !== '') {
    normalized.padValue = field.padValue
  }
  return normalized
}

function normalizeType(type: TelegramType): TelegramType {
  return {
    code: type.code,
    name: type.name,
    description: type.description,
    groups: type.groups.map((group) => ({
      id: group.id,
      name: group.name,
      fields: group.fields.map(normalizeField),
    })),
  }
}

/**
 * Builds the telegram-templates section object (the value that slots into the
 * ADR-0008 configuration profile under `telegramTemplates`). Kept separate from
 * {@link serializeTelegrams} so the profile can embed the section without
 * re-parsing a JSON string.
 */
export function toTelegramSection(
  types: readonly TelegramType[],
  endOfTelegram: string,
): TelegramTemplatesProfile {
  return {
    schemaVersion: TELEGRAM_SCHEMA_VERSION,
    endOfTelegram,
    types: types.map(normalizeType),
  }
}

/** Serialises the telegram registry to pretty, diffable JSON. */
export function serializeTelegrams(
  types: readonly TelegramType[],
  endOfTelegram: string,
): string {
  return JSON.stringify(toTelegramSection(types, endOfTelegram), null, 2)
}

/** Parses + validates a JSON telegram-templates string, never throwing on bad input. */
export function parseTelegrams(json: string): TelegramParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, errors: [`Invalid JSON: ${message}`] }
  }
  return validateTelegramTemplates(parsed)
}

/**
 * Loads the saved telegram registry from `localStorage`, or `null` when there is
 * none or it can't be read/parsed. A stored-but-empty registry is honoured (it
 * means the user deleted every type) — only absence/corruption returns `null`.
 */
export function loadStoredTelegrams(): { types: TelegramType[]; endOfTelegram: string } | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const result = parseTelegrams(raw)
    if (!result.ok || !result.profile) return null
    return { types: result.profile.types, endOfTelegram: result.profile.endOfTelegram }
  } catch {
    // Ignore unavailable/corrupt storage — the caller falls back to seeds.
    return null
  }
}

/** Persists the telegram registry to `localStorage` (best-effort; ignores failures). */
export function persistTelegrams(types: readonly TelegramType[], endOfTelegram: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, serializeTelegrams(types, endOfTelegram))
  } catch {
    // Ignore quota/SSR/private-mode failures — persistence is best-effort.
  }
}

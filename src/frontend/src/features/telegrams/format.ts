import type { DataType, TelegramField, TelegramFieldGroup, TelegramType } from './types'

/** Upper bound on a single field's width (bytes), to keep previews bounded. */
export const MAX_FIELD_LENGTH = 1024

/**
 * Synthetic field id for the End-of-Telegram terminator in the byte-map preview.
 * It is not a real, editable field — it only marks the trailing terminator bytes
 * so previews can render and label them distinctly.
 */
export const END_OF_TELEGRAM_ID = '__eot__'

/** Flattens a type's groups into the ordered field sequence they encode to. */
export function allFields(groups: readonly TelegramFieldGroup[]): TelegramField[] {
  return groups.flatMap((group) => group.fields)
}

/** A field paired with its derived byte offset within the telegram. */
export interface PositionedField {
  field: TelegramField
  /** Byte offset = sum of the lengths of every preceding field. */
  offset: number
}

/** Derives each field's byte offset from the order and length of the fields before it. */
export function withOffsets(fields: readonly TelegramField[]): PositionedField[] {
  let offset = 0
  return fields.map((field) => {
    const positioned: PositionedField = { field, offset }
    offset += fieldLength(field)
    return positioned
  })
}

/**
 * Total telegram length in bytes: the sum of every field's length, plus the
 * End-of-Telegram terminator bytes when one is configured.
 */
export function totalLength(fields: readonly TelegramField[], endOfTelegram = ''): number {
  const fieldBytes = fields.reduce((sum, field) => sum + fieldLength(field), 0)
  return fieldBytes + encodeEndOfTelegram(endOfTelegram).length
}

function fieldLength(field: TelegramField): number {
  return Number.isInteger(field.length) && field.length > 0 ? field.length : 0
}

/** One byte in a preview: a value 0–255, or `null` when it can't be resolved yet. */
export type PreviewByte = number | null

/** Encodes a field's default value into exactly `length` preview bytes. */
export function encodeField(field: TelegramField): PreviewByte[] {
  const length = fieldLength(field)
  if (length === 0) return []
  if (field.auto) return unknown(length)

  switch (field.dataType) {
    case 'HEX':
      return encodeHex(field.defaultValue, length)
    case 'INT':
      return encodeInt(field.defaultValue, length)
    case 'STRING':
      return encodeString(field.defaultValue, length)
    default:
      return unknown(length)
  }
}

function unknown(length: number): PreviewByte[] {
  return Array.from({ length }, () => null)
}

function fit(bytes: PreviewByte[], length: number): PreviewByte[] {
  if (bytes.length === length) return bytes
  if (bytes.length > length) return bytes.slice(0, length)
  return [...bytes, ...Array.from({ length: length - bytes.length }, () => 0 as PreviewByte)]
}

function cleanHex(value: string): string {
  return value.replace(/0x/gi, '').replace(/[\s,:_-]+/g, '')
}

function isValidHex(cleaned: string): boolean {
  return cleaned.length % 2 === 0 && (cleaned.length === 0 || /^[0-9a-fA-F]+$/.test(cleaned))
}

function encodeHex(value: string, length: number): PreviewByte[] {
  const cleaned = cleanHex(value)
  if (!isValidHex(cleaned)) return unknown(length)
  const bytes: PreviewByte[] = []
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes.push(Number.parseInt(cleaned.slice(i, i + 2), 16))
  }
  return fit(bytes, length)
}

function encodeInt(value: string, length: number): PreviewByte[] {
  const trimmed = value.trim()
  if (trimmed === '') return fit([], length)
  if (!/^-?\d+$/.test(trimmed)) return unknown(length)

  // Big-endian two's-complement into `length` bytes (low bytes on overflow).
  let v = BigInt(trimmed)
  const modulus = 1n << BigInt(length * 8)
  v = ((v % modulus) + modulus) % modulus
  const bytes: PreviewByte[] = new Array<PreviewByte>(length)
  for (let i = length - 1; i >= 0; i -= 1) {
    bytes[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return bytes
}

function encodeString(value: string, length: number): PreviewByte[] {
  const bytes: PreviewByte[] = []
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    bytes.push(code > 0xff ? null : code)
  }
  return fit(bytes, length)
}

/**
 * Encodes the End-of-Telegram terminator into its Latin-1 preview bytes (one per
 * character). An empty string yields no bytes; characters outside Latin-1 render
 * as unknown (`??`) bytes. The result is appended to the telegram's byte form.
 */
export function encodeEndOfTelegram(endOfTelegram: string): PreviewByte[] {
  const bytes: PreviewByte[] = []
  for (const char of endOfTelegram) {
    const code = char.codePointAt(0) ?? 0
    bytes.push(code > 0xff ? null : code)
  }
  return bytes
}

/** A field with its derived offset and encoded bytes, for the byte-map preview. */
export interface ByteMapField {
  field: TelegramField
  offset: number
  bytes: PreviewByte[]
}

/**
 * Builds the per-field byte map for the preview. When `endOfTelegram` is set, its
 * bytes are appended as a trailing synthetic {@link END_OF_TELEGRAM_ID} entry so
 * the terminator shows up as part of the telegram's byte form.
 */
export function buildByteMap(
  fields: readonly TelegramField[],
  endOfTelegram = '',
): ByteMapField[] {
  const map = withOffsets(fields).map(({ field, offset }) => ({
    field,
    offset,
    bytes: encodeField(field),
  }))

  const eotBytes = encodeEndOfTelegram(endOfTelegram)
  if (eotBytes.length > 0) {
    map.push({
      field: {
        id: END_OF_TELEGRAM_ID,
        name: 'End of Telegram',
        dataType: 'STRING',
        length: eotBytes.length,
        defaultValue: endOfTelegram,
      },
      offset: totalLength(fields),
      bytes: eotBytes,
    })
  }

  return map
}

/** Renders a single preview byte as two upper-case hex digits, or `??` if unknown. */
export function formatByte(byte: PreviewByte): string {
  return byte === null ? '??' : (byte & 0xff).toString(16).toUpperCase().padStart(2, '0')
}

/** Renders the whole telegram as a space-separated hex byte stream. */
export function rawStream(fields: readonly TelegramField[], endOfTelegram = ''): string {
  return buildByteMap(fields, endOfTelegram)
    .flatMap((entry) => entry.bytes)
    .map(formatByte)
    .join(' ')
}

/** Renders a single preview byte as its printable ASCII character, or `.`. */
export function formatAscii(byte: PreviewByte): string {
  if (byte === null) return '.'
  return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.'
}

/**
 * Renders the telegram payload as ASCII text: printable bytes (0x20–0x7E) as
 * their character, and control / non-printable / unresolved bytes as `.`. A
 * configured End-of-Telegram terminator is included at the end.
 */
export function asciiStream(fields: readonly TelegramField[], endOfTelegram = ''): string {
  return buildByteMap(fields, endOfTelegram)
    .flatMap((entry) => entry.bytes)
    .map(formatAscii)
    .join('')
}

/** Per-field validation messages, keyed by the field property they concern. */
export interface FieldErrors {
  name?: string
  length?: string
  defaultValue?: string
}

/** Validates one field against its siblings (for uniqueness). */
export function validateField(
  field: TelegramField,
  siblings: readonly TelegramField[],
): FieldErrors {
  const errors: FieldErrors = {}

  const name = field.name.trim()
  if (name === '') {
    errors.name = 'Name is required'
  } else if (
    siblings.some(
      (other) => other.id !== field.id && other.name.trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    errors.name = 'Name must be unique'
  }

  if (!Number.isInteger(field.length) || field.length < 1) {
    errors.length = 'Length must be 1 or greater'
  } else if (field.length > MAX_FIELD_LENGTH) {
    errors.length = `Length must be ${MAX_FIELD_LENGTH} or less`
  }

  if (!field.auto && errors.length === undefined) {
    const valueError = validateDefaultValue(field.dataType, field.defaultValue, field.length)
    if (valueError) errors.defaultValue = valueError
  }

  return errors
}

function validateDefaultValue(
  dataType: DataType,
  value: string,
  length: number,
): string | undefined {
  if (dataType === 'HEX') {
    const cleaned = cleanHex(value)
    if (!isValidHex(cleaned)) return 'Enter hex byte pairs (e.g. 4D 50)'
    if (cleaned.length / 2 > length) return `Value exceeds ${length} byte(s)`
    return undefined
  }

  if (dataType === 'INT') {
    const trimmed = value.trim()
    if (trimmed === '') return undefined
    if (!/^-?\d+$/.test(trimmed)) return 'Enter a whole number'
    const bits = BigInt(length * 8)
    const n = BigInt(trimmed)
    const min = -(1n << (bits - 1n))
    const max = (1n << bits) - 1n
    if (n < min || n > max) return `Value does not fit in ${length} byte(s)`
    return undefined
  }

  // STRING
  if ([...value].some((char) => (char.codePointAt(0) ?? 0) > 0xff)) {
    return 'Use single-byte (Latin-1) characters'
  }
  if (value.length > length) return `Value exceeds ${length} byte(s)`
  return undefined
}

/** True when every field is valid and the type has at least one field. */
export function isTypeValid(type: TelegramType): boolean {
  const fields = allFields(type.groups)
  if (fields.length === 0) return false
  return fields.every((field) => Object.keys(validateField(field, fields)).length === 0)
}

/** Validation messages for the "add telegram type" form. */
export interface NewTypeErrors {
  code?: string
  name?: string
}

/** Validates a proposed new type code + name against the existing registry. */
export function validateNewType(
  code: string,
  name: string,
  existing: readonly TelegramType[],
): NewTypeErrors {
  const errors: NewTypeErrors = {}

  const normalized = code.trim().toUpperCase()
  if (normalized === '') {
    errors.code = 'Code is required'
  } else if (!/^[A-Z0-9]{2,4}$/.test(normalized)) {
    errors.code = 'Use 2–4 letters or digits'
  } else if (existing.some((type) => type.code === normalized)) {
    errors.code = `Type "${normalized}" already exists`
  }

  if (name.trim() === '') {
    errors.name = 'Name is required'
  }

  return errors
}

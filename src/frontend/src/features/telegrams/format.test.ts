import { describe, expect, it } from 'vitest'
import {
  END_OF_TELEGRAM_ID,
  asciiStream,
  buildByteMap,
  encodeEndOfTelegram,
  encodeField,
  formatByte,
  isTypeValid,
  rawStream,
  totalLength,
  validateField,
  validateNewType,
  withOffsets,
} from './format'
import type { TelegramField, TelegramType } from './types'

const field = (overrides: Partial<TelegramField> = {}): TelegramField => ({
  id: overrides.id ?? 'f1',
  name: overrides.name ?? 'Field',
  dataType: overrides.dataType ?? 'STRING',
  length: overrides.length ?? 1,
  defaultValue: overrides.defaultValue ?? '',
  auto: overrides.auto,
})

describe('withOffsets / totalLength', () => {
  it('derives contiguous offsets from preceding field lengths', () => {
    const fields = [
      field({ id: 'a', length: 4 }),
      field({ id: 'b', length: 2 }),
      field({ id: 'c', length: 20 }),
    ]
    expect(withOffsets(fields).map((p) => p.offset)).toEqual([0, 4, 6])
    expect(totalLength(fields)).toBe(26)
  })

  it('treats invalid lengths as zero width', () => {
    const fields = [field({ id: 'a', length: 0 }), field({ id: 'b', length: 3 })]
    expect(withOffsets(fields).map((p) => p.offset)).toEqual([0, 0])
    expect(totalLength(fields)).toBe(3)
  })
})

describe('encodeField', () => {
  it('encodes a STRING and pads with zeros to length', () => {
    expect(encodeField(field({ dataType: 'STRING', length: 4, defaultValue: 'STX' }))).toEqual([
      0x53, 0x54, 0x58, 0x00,
    ])
  })

  it('encodes HEX byte pairs and pads to length', () => {
    expect(encodeField(field({ dataType: 'HEX', length: 2, defaultValue: '4D 50' }))).toEqual([
      0x4d, 0x50,
    ])
    expect(encodeField(field({ dataType: 'HEX', length: 3, defaultValue: 'FF' }))).toEqual([
      0xff, 0x00, 0x00,
    ])
  })

  it('renders invalid HEX as unknown bytes', () => {
    expect(encodeField(field({ dataType: 'HEX', length: 2, defaultValue: 'ZZ' }))).toEqual([
      null,
      null,
    ])
  })

  it('encodes an INT big-endian into length bytes', () => {
    expect(encodeField(field({ dataType: 'INT', length: 4, defaultValue: '258' }))).toEqual([
      0x00, 0x00, 0x01, 0x02,
    ])
  })

  it('renders auto (computed) fields as unknown bytes', () => {
    expect(encodeField(field({ dataType: 'HEX', length: 2, auto: true }))).toEqual([null, null])
  })
})

describe('rawStream / formatByte', () => {
  it('formats known and unknown bytes', () => {
    expect(formatByte(0x0a)).toBe('0A')
    expect(formatByte(null)).toBe('??')
  })

  it('joins the encoded telegram into a hex stream', () => {
    const fields = [
      field({ id: 'a', dataType: 'HEX', length: 2, defaultValue: '4D 50' }),
      field({ id: 'b', dataType: 'HEX', length: 2, auto: true }),
    ]
    expect(rawStream(fields)).toBe('4D 50 ?? ??')
  })
})

describe('asciiStream', () => {
  it('renders printable bytes as characters and the rest as dots', () => {
    const fields = [
      field({ id: 'a', dataType: 'STRING', length: 2, defaultValue: 'CV' }),
      field({ id: 'b', dataType: 'INT', length: 2, defaultValue: '1' }),
      field({ id: 'c', dataType: 'STRING', length: 2, defaultValue: 'N' }),
    ]
    // 'CV' -> "CV"; INT 1 (00 01) -> ".."; 'N' padded (4E 00) -> "N."
    expect(asciiStream(fields)).toBe('CV..N.')
  })

  it('renders unresolved (auto/invalid) bytes as dots', () => {
    const fields = [field({ id: 'a', dataType: 'HEX', length: 2, auto: true })]
    expect(asciiStream(fields)).toBe('..')
  })
})

describe('buildByteMap', () => {
  it('pairs each field with its offset and encoded bytes', () => {
    const fields = [
      field({ id: 'a', dataType: 'STRING', length: 2, defaultValue: 'Hi' }),
      field({ id: 'b', dataType: 'INT', length: 1, defaultValue: '5' }),
    ]
    const map = buildByteMap(fields)
    expect(map[0]).toMatchObject({ offset: 0, bytes: [0x48, 0x69] })
    expect(map[1]).toMatchObject({ offset: 2, bytes: [0x05] })
  })
})

describe('encodeEndOfTelegram', () => {
  it('encodes each terminator character as a Latin-1 byte', () => {
    expect(encodeEndOfTelegram('#')).toEqual([0x23])
    expect(encodeEndOfTelegram('!')).toEqual([0x21])
    expect(encodeEndOfTelegram('\r\n')).toEqual([0x0d, 0x0a])
  })

  it('is empty for an empty terminator', () => {
    expect(encodeEndOfTelegram('')).toEqual([])
  })

  it('renders characters outside Latin-1 as unknown bytes', () => {
    expect(encodeEndOfTelegram('€')).toEqual([null])
  })
})

describe('End-of-Telegram in the byte form', () => {
  const fields = [field({ id: 'a', dataType: 'STRING', length: 2, defaultValue: 'Hi' })]

  it('appends the terminator as a trailing synthetic entry', () => {
    const map = buildByteMap(fields, '#')
    expect(map).toHaveLength(2)
    expect(map[1].field.id).toBe(END_OF_TELEGRAM_ID)
    expect(map[1]).toMatchObject({ offset: 2, bytes: [0x23] })
  })

  it('omits the entry when there is no terminator', () => {
    expect(buildByteMap(fields, '')).toHaveLength(1)
  })

  it('includes the terminator in the raw and ASCII streams', () => {
    expect(rawStream(fields, '#')).toBe('48 69 23')
    expect(asciiStream(fields, '#')).toBe('Hi#')
  })

  it('counts the terminator bytes in the total length', () => {
    expect(totalLength(fields, '')).toBe(2)
    expect(totalLength(fields, '#')).toBe(3)
    expect(totalLength(fields, '\r\n')).toBe(4)
  })
})

describe('validateField', () => {
  it('requires a name', () => {
    expect(validateField(field({ name: '  ' }), []).name).toBeDefined()
  })

  it('rejects a duplicate name (case-insensitive)', () => {
    const a = field({ id: 'a', name: 'Header' })
    const b = field({ id: 'b', name: 'header' })
    expect(validateField(b, [a, b]).name).toBe('Name must be unique')
  })

  it('rejects a non-positive length', () => {
    expect(validateField(field({ length: 0 }), []).length).toBeDefined()
  })

  it('flags a default value that does not fit the field width', () => {
    const errors = validateField(field({ dataType: 'INT', length: 1, defaultValue: '5000' }), [])
    expect(errors.defaultValue).toContain('does not fit')
  })

  it('skips value validation for auto fields', () => {
    expect(validateField(field({ dataType: 'HEX', length: 2, auto: true, defaultValue: 'zz' }), []))
      .toEqual({})
  })
})

describe('isTypeValid', () => {
  const type = (fields: TelegramField[]): TelegramType => ({
    code: 'XX',
    name: 'X',
    description: '',
    groups: [{ id: 'g', name: 'DefaultTelegramHeader', fields }],
  })

  it('is false when there are no fields', () => {
    expect(isTypeValid(type([]))).toBe(false)
  })

  it('is false when any field is invalid', () => {
    expect(isTypeValid(type([field({ name: '' })]))).toBe(false)
  })

  it('is true when every field is valid', () => {
    expect(isTypeValid(type([field({ name: 'Ok', length: 2, defaultValue: 'ok' })]))).toBe(true)
  })
})

describe('validateNewType', () => {
  const existing: TelegramType[] = [{ code: 'MP', name: 'Material Present', description: '', groups: [] }]

  it('requires a code and a name', () => {
    const errors = validateNewType('', '', existing)
    expect(errors.code).toBeDefined()
    expect(errors.name).toBeDefined()
  })

  it('rejects a badly formatted code', () => {
    expect(validateNewType('toolong', 'X', existing).code).toBeDefined()
  })

  it('rejects a duplicate code regardless of case', () => {
    expect(validateNewType('mp', 'Dup', existing).code).toContain('already exists')
  })

  it('accepts a fresh, well-formed code + name', () => {
    expect(validateNewType('SR', 'Sensor Reset', existing)).toEqual({})
  })
})

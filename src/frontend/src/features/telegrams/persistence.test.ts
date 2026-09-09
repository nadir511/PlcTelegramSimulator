import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SEED_TELEGRAM_TYPES } from './defaults'
import {
  STORAGE_KEY,
  TELEGRAM_SCHEMA_VERSION,
  loadStoredTelegrams,
  parseTelegrams,
  persistTelegrams,
  serializeTelegrams,
  validateTelegramTemplates,
} from './persistence'
import type { TelegramType } from './types'

const sample: TelegramType[] = [
  {
    code: 'MP',
    name: 'Message Point',
    description: 'Sample.',
    groups: [
      {
        id: 'mp-header',
        name: 'DefaultTelegramHeader',
        fields: [
          { id: 'mp-sender', name: 'Sender', dataType: 'STRING', length: 2, defaultValue: 'CV' },
          { id: 'mp-crc', name: 'Checksum', dataType: 'HEX', length: 2, defaultValue: '', auto: true },
        ],
      },
    ],
  },
]

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('serializeTelegrams / parseTelegrams', () => {
  it('round-trips the registry and stamps the schema version', () => {
    const json = serializeTelegrams(sample, '#')
    expect(JSON.parse(json).schemaVersion).toBe(TELEGRAM_SCHEMA_VERSION)

    const result = parseTelegrams(json)
    expect(result.ok).toBe(true)
    expect(result.profile?.endOfTelegram).toBe('#')
    expect(result.profile?.types).toEqual(sample)
  })

  it('preserves an empty terminator', () => {
    const result = parseTelegrams(serializeTelegrams(sample, ''))
    expect(result.profile?.endOfTelegram).toBe('')
  })

  it('round-trips a field padding side and character', () => {
    const withPad: TelegramType[] = [
      {
        code: 'PP',
        name: 'Padded',
        description: '',
        groups: [
          {
            id: 'g',
            name: 'G',
            fields: [
              {
                id: 'f',
                name: 'TelegramId',
                dataType: 'STRING',
                length: 6,
                defaultValue: '1',
                padSide: 'left',
                padValue: '0',
              },
            ],
          },
        ],
      },
    ]
    const restored = parseTelegrams(serializeTelegrams(withPad, '#')).profile?.types
    expect(restored?.[0].groups[0].fields[0]).toMatchObject({ padSide: 'left', padValue: '0' })
  })

  it('omits default padding (right side, empty fill) from the serialised blob', () => {
    const json = serializeTelegrams(sample, '#')
    expect(json).not.toContain('padSide')
    expect(json).not.toContain('padValue')
  })

  it('reports invalid JSON without throwing', () => {
    const result = parseTelegrams('{ not json')
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/invalid json/i)
  })
})

describe('validateTelegramTemplates (safe import)', () => {
  it('rejects a non-object top level', () => {
    expect(validateTelegramTemplates(42).ok).toBe(false)
    expect(validateTelegramTemplates([]).ok).toBe(false)
  })

  it('coerces bad field data and drops entries with no code', () => {
    const result = validateTelegramTemplates({
      types: [
        {
          code: 'AB',
          name: 'Ok',
          groups: [
            {
              id: 'g1',
              name: 'G',
              fields: [
                // dataType + length are invalid → coerced to STRING / 1.
                { id: 'f1', name: 'X', dataType: 'FLOAT', length: 0, defaultValue: 5 },
              ],
            },
          ],
        },
        { name: 'no code here' },
      ],
    })

    expect(result.ok).toBe(true)
    expect(result.profile?.types).toHaveLength(1)
    const field = result.profile?.types[0].groups[0].fields[0]
    expect(field?.dataType).toBe('STRING')
    expect(field?.length).toBe(1)
    expect(field?.defaultValue).toBe('')
    expect(result.errors.some((message) => /missing code/i.test(message))).toBe(true)
  })

  it('falls back to defaults for a missing terminator and version', () => {
    const result = validateTelegramTemplates({ types: [] })
    expect(result.profile?.schemaVersion).toBe(TELEGRAM_SCHEMA_VERSION)
    expect(result.profile?.endOfTelegram).toBe('~')
  })
})

describe('loadStoredTelegrams / persistTelegrams', () => {
  it('returns null when nothing is stored', () => {
    expect(loadStoredTelegrams()).toBeNull()
  })

  it('round-trips the seeded registry through localStorage', () => {
    persistTelegrams(SEED_TELEGRAM_TYPES, '!')
    expect(localStorage.getItem(STORAGE_KEY)).toContain('"schemaVersion"')

    const stored = loadStoredTelegrams()
    expect(stored?.endOfTelegram).toBe('!')
    expect(stored?.types.map((type) => type.code)).toEqual(
      SEED_TELEGRAM_TYPES.map((type) => type.code),
    )
  })

  it('honours a stored-but-empty registry (all types deleted)', () => {
    persistTelegrams([], '#')
    const stored = loadStoredTelegrams()
    expect(stored).not.toBeNull()
    expect(stored?.types).toEqual([])
  })

  it('returns null for a corrupt blob', () => {
    localStorage.setItem(STORAGE_KEY, 'not json at all')
    expect(loadStoredTelegrams()).toBeNull()
  })
})

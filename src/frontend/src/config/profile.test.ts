import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../features/connection/defaults'
import { DEFAULT_END_OF_TELEGRAM, SEED_TELEGRAM_TYPES } from '../features/telegrams/defaults'
import {
  APP_NAME,
  PROFILE_SCHEMA_VERSION,
  parseProfile,
  serializeProfile,
  validateProfile,
} from './profile'

const telegram = { endOfTelegram: DEFAULT_END_OF_TELEGRAM, types: SEED_TELEGRAM_TYPES }

describe('config profile', () => {
  it('serializes an envelope with app marker, schema, timestamp, and both sections', () => {
    const json = serializeProfile({ connection: DEFAULT_CONFIG, telegram })
    const parsed = JSON.parse(json)

    expect(parsed.app).toBe(APP_NAME)
    expect(parsed.schemaVersion).toBe(PROFILE_SCHEMA_VERSION)
    expect(typeof parsed.exportedAt).toBe('string')
    expect(parsed.connection).toEqual(DEFAULT_CONFIG)
    expect(parsed.telegramTemplates.types).toHaveLength(SEED_TELEGRAM_TYPES.length)
    expect(parsed.telegramTemplates.endOfTelegram).toBe(DEFAULT_END_OF_TELEGRAM)
  })

  it('round-trips both sections through serialize + parse', () => {
    const connection = { ...DEFAULT_CONFIG, bindAddress: '0.0.0.0', sendPort: 5000 }
    const result = parseProfile(serializeProfile({ connection, telegram }))

    expect(result.ok).toBe(true)
    expect(result.sections?.connection).toEqual(connection)
    expect(result.sections?.telegram?.types).toHaveLength(SEED_TELEGRAM_TYPES.length)
  })

  it('rejects a non-object value', () => {
    const result = validateProfile(42)
    expect(result.ok).toBe(false)
    expect(result.errors).not.toHaveLength(0)
  })

  it('rejects a file for a different app', () => {
    const result = validateProfile({ app: 'SomethingElse', schemaVersion: 1 })
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain(APP_NAME)
  })

  it('fills absent sections with defaults so a profile is a full snapshot (ADR-0008)', () => {
    const connectionOnly = validateProfile({
      app: APP_NAME,
      schemaVersion: 1,
      connection: { ...DEFAULT_CONFIG, sendPort: 5000 },
    })
    expect(connectionOnly.ok).toBe(true)
    expect(connectionOnly.sections?.connection?.sendPort).toBe(5000)
    // Absent telegram section is reset to the seeded defaults, not left undefined.
    expect(connectionOnly.sections?.telegram?.types).toHaveLength(SEED_TELEGRAM_TYPES.length)
    expect(connectionOnly.warnings.some((w) => /telegram.*default/i.test(w))).toBe(true)

    const telegramOnly = validateProfile({
      app: APP_NAME,
      schemaVersion: 1,
      telegramTemplates: { schemaVersion: 1, endOfTelegram: '#', types: [] },
    })
    expect(telegramOnly.sections?.telegram?.types).toEqual([])
    // Absent connection section is reset to defaults.
    expect(telegramOnly.sections?.connection).toEqual(DEFAULT_CONFIG)
    expect(telegramOnly.warnings.some((w) => /connection.*default/i.test(w))).toBe(true)
  })

  it('skips a present-but-invalid section without wiping the other (ADR-0008)', () => {
    const result = validateProfile({
      app: APP_NAME,
      schemaVersion: 1,
      connection: DEFAULT_CONFIG,
      telegramTemplates: 'not-an-object',
    })
    expect(result.ok).toBe(true)
    expect(result.sections?.connection).toEqual(DEFAULT_CONFIG)
    // Present-but-unusable telegram section is skipped (kept current), not defaulted.
    expect(result.sections?.telegram).toBeUndefined()
    expect(result.warnings.some((w) => /skipped/i.test(w))).toBe(true)
  })

  it('skips a present-but-non-object connection section rather than resetting it', () => {
    const result = validateProfile({
      app: APP_NAME,
      schemaVersion: 1,
      connection: null,
      telegramTemplates: { schemaVersion: 1, endOfTelegram: '#', types: [] },
    })
    expect(result.ok).toBe(true)
    // Corrupt connection fragment must not wipe current settings.
    expect(result.sections?.connection).toBeUndefined()
    expect(result.sections?.telegram?.types).toEqual([])
    expect(result.warnings.some((w) => /connection.*skipped/i.test(w))).toBe(true)
  })

  it('resolves no sections when both are present but unusable', () => {
    const result = validateProfile({
      app: APP_NAME,
      schemaVersion: 1,
      connection: 'nope',
      telegramTemplates: 42,
    })
    expect(result.ok).toBe(true)
    expect(result.sections?.connection).toBeUndefined()
    expect(result.sections?.telegram).toBeUndefined()
  })

  it('warns but still imports when the file schema is newer', () => {
    const result = validateProfile({
      app: APP_NAME,
      schemaVersion: PROFILE_SCHEMA_VERSION + 1,
      connection: DEFAULT_CONFIG,
    })
    expect(result.ok).toBe(true)
    expect(result.warnings.some((w) => /newer/i.test(w))).toBe(true)
  })

  it('surfaces connection coercion notes prefixed with "Connection:"', () => {
    const result = validateProfile({
      app: APP_NAME,
      schemaVersion: 1,
      connection: { ...DEFAULT_CONFIG, sendPort: 'oops' },
    })
    expect(result.sections?.connection?.sendPort).toBe(DEFAULT_CONFIG.sendPort)
    expect(result.warnings.some((w) => w.startsWith('Connection:'))).toBe(true)
  })

  it('fails on invalid JSON', () => {
    const result = parseProfile('{ broken')
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/invalid json/i)
  })
})

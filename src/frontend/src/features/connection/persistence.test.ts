import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './defaults'
import {
  CONNECTION_SCHEMA_VERSION,
  STORAGE_KEY,
  loadStoredConnection,
  persistConnection,
  sanitizeConnectionConfig,
  serializeConnection,
} from './persistence'

describe('connection persistence', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('round-trips a config through serialize + sanitize', () => {
    const config = {
      bindAddress: '0.0.0.0',
      sendPort: 4000,
      receivePort: 4001,
      processingDelayMs: 120,
      autoAcceptReconnections: false,
    }
    const json = serializeConnection(config)
    const parsed = JSON.parse(json)

    expect(parsed.schemaVersion).toBe(CONNECTION_SCHEMA_VERSION)
    expect(sanitizeConnectionConfig(parsed.config).config).toEqual(config)
  })

  it('falls back to defaults for a non-object section', () => {
    const { config, warnings } = sanitizeConnectionConfig(42)
    expect(config).toEqual(DEFAULT_CONFIG)
    expect(warnings).not.toHaveLength(0)
  })

  it('coerces wrong-typed fields to defaults with a warning each', () => {
    const { config, warnings } = sanitizeConnectionConfig({
      bindAddress: 10,
      sendPort: '4000',
      receivePort: 4001.5,
      processingDelayMs: null,
      autoAcceptReconnections: 'yes',
    })

    expect(config).toEqual({
      bindAddress: DEFAULT_CONFIG.bindAddress,
      sendPort: DEFAULT_CONFIG.sendPort,
      receivePort: DEFAULT_CONFIG.receivePort,
      processingDelayMs: DEFAULT_CONFIG.processingDelayMs,
      autoAcceptReconnections: DEFAULT_CONFIG.autoAcceptReconnections,
    })
    expect(warnings).toHaveLength(5)
  })

  it('keeps out-of-range but well-typed values (range is the UI validator’s job)', () => {
    const { config, warnings } = sanitizeConnectionConfig({
      ...DEFAULT_CONFIG,
      sendPort: 70000,
      processingDelayMs: -5,
    })
    expect(config.sendPort).toBe(70000)
    expect(config.processingDelayMs).toBe(-5)
    expect(warnings).toHaveLength(0)
  })

  it('persists and loads via localStorage', () => {
    const config = { ...DEFAULT_CONFIG, bindAddress: '192.168.1.10', sendPort: 5000 }
    persistConnection(config)
    expect(loadStoredConnection()).toEqual(config)
  })

  it('returns null when nothing is stored', () => {
    expect(loadStoredConnection()).toBeNull()
  })

  it('returns null for a corrupt blob', () => {
    localStorage.setItem(STORAGE_KEY, '{ not json')
    expect(loadStoredConnection()).toBeNull()
  })
})

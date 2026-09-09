import { DEFAULT_CONFIG } from './defaults'
import type { ListenerConfig } from './types'

/**
 * Schema version of the persisted connection blob. Additive changes keep this
 * number; a breaking change bumps it and ships a migration (see ADR-0008).
 */
export const CONNECTION_SCHEMA_VERSION = 1

/**
 * `localStorage` key the connection settings persist under (its own versioned
 * blob). Mirrors the telegram/canvas features so each feature owns exactly one
 * key, shaped to slot into the ADR-0008 configuration profile's `connection`
 * section without a new format decision.
 */
export const STORAGE_KEY = 'plc.connection.v1'

/** The serialisable connection section: the listener settings plus a schema stamp. */
export interface ConnectionProfile {
  schemaVersion: number
  config: ListenerConfig
}

/** The result of sanitising an untrusted connection section. */
export interface ConnectionSanitizeResult {
  config: ListenerConfig
  /** Non-fatal notes: coerced/defaulted fields, ignored unknowns. */
  warnings: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function coerceString(
  value: unknown,
  field: string,
  fallback: string,
  warnings: string[],
): string {
  if (typeof value === 'string') return value
  if (value !== undefined) {
    warnings.push(`Ignored non-text ${field}; kept "${fallback}".`)
  }
  return fallback
}

function coerceInteger(
  value: unknown,
  field: string,
  fallback: number,
  warnings: string[],
): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (value !== undefined) {
    warnings.push(`Ignored non-integer ${field}; kept ${fallback}.`)
  }
  return fallback
}

function coerceBoolean(
  value: unknown,
  field: string,
  fallback: boolean,
  warnings: string[],
): boolean {
  if (typeof value === 'boolean') return value
  if (value !== undefined) {
    warnings.push(`Ignored non-boolean ${field}; kept ${fallback}.`)
  }
  return fallback
}

/**
 * Coerces an untrusted value into a {@link ListenerConfig}, filling each field
 * from {@link DEFAULT_CONFIG} when it is missing or the wrong type. Never throws
 * and never enforces value ranges — range checks stay in `validateConfig`, which
 * the UI surfaces so the user can fix an imported-but-invalid field before start
 * ("ADR-0008 safe import").
 */
export function sanitizeConnectionConfig(value: unknown): ConnectionSanitizeResult {
  const warnings: string[] = []
  if (!isRecord(value)) {
    warnings.push('Connection section was not an object; used defaults.')
    return { config: { ...DEFAULT_CONFIG }, warnings }
  }

  const config: ListenerConfig = {
    bindAddress: coerceString(value.bindAddress, 'bindAddress', DEFAULT_CONFIG.bindAddress, warnings),
    sendPort: coerceInteger(value.sendPort, 'sendPort', DEFAULT_CONFIG.sendPort, warnings),
    receivePort: coerceInteger(value.receivePort, 'receivePort', DEFAULT_CONFIG.receivePort, warnings),
    processingDelayMs: coerceInteger(
      value.processingDelayMs,
      'processingDelayMs',
      DEFAULT_CONFIG.processingDelayMs,
      warnings,
    ),
    autoAcceptReconnections: coerceBoolean(
      value.autoAcceptReconnections,
      'autoAcceptReconnections',
      DEFAULT_CONFIG.autoAcceptReconnections,
      warnings,
    ),
  }
  return { config, warnings }
}

/** Serialises the connection settings to pretty, diffable JSON. */
export function serializeConnection(config: ListenerConfig): string {
  const profile: ConnectionProfile = {
    schemaVersion: CONNECTION_SCHEMA_VERSION,
    config: {
      bindAddress: config.bindAddress,
      sendPort: config.sendPort,
      receivePort: config.receivePort,
      processingDelayMs: config.processingDelayMs,
      autoAcceptReconnections: config.autoAcceptReconnections,
    },
  }
  return JSON.stringify(profile, null, 2)
}

/**
 * Loads the saved connection settings from `localStorage`, or `null` when there
 * are none or storage can't be read/parsed. The caller falls back to
 * {@link DEFAULT_CONFIG}.
 */
export function loadStoredConnection(): ListenerConfig | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    const { config } = sanitizeConnectionConfig(parsed.config)
    return config
  } catch {
    // Ignore unavailable/corrupt storage — the caller falls back to defaults.
    return null
  }
}

/** Persists the connection settings to `localStorage` (best-effort; ignores failures). */
export function persistConnection(config: ListenerConfig): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, serializeConnection(config))
  } catch {
    // Ignore quota/SSR/private-mode failures — persistence is best-effort.
  }
}

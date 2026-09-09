import { DEFAULT_CONFIG } from '../features/connection/defaults'
import { sanitizeConnectionConfig } from '../features/connection/persistence'
import type { ListenerConfig } from '../features/connection/types'
import { DEFAULT_END_OF_TELEGRAM, SEED_TELEGRAM_TYPES } from '../features/telegrams/defaults'
import {
  toTelegramSection,
  validateTelegramTemplates,
  type TelegramTemplatesProfile,
} from '../features/telegrams/persistence'
import type { TelegramType } from '../features/telegrams/types'

/**
 * Unified configuration profile (ADR-0008). A single portable file that captures
 * the parts of the simulator a user wants to keep across restarts — the
 * connection settings and the telegram templates — so they can stop the app and
 * resume from the same setup. The canvas layout stays in its own file
 * (`canvas-layout.json`, ADR-0013); this profile deliberately does not carry it.
 *
 * Runtime/session state (a running listener, live traffic, in-flight orders) is
 * never exported: the backend is stateless/in-memory (ADR-0005) and import never
 * auto-starts anything — it only fills the editable settings.
 */

/** Application marker written to every profile; import rejects a mismatch. */
export const APP_NAME = 'PlcTelegramSimulator'

/**
 * Envelope schema version. Additive changes keep this number; a breaking change
 * bumps it and ships a migration. A newer-than-supported file imports with a
 * warning (unknown fields are ignored) rather than failing.
 */
export const PROFILE_SCHEMA_VERSION = 1

/** Suggested file name for the exported profile. */
export const PROFILE_FILE_NAME = 'plc-simulator-config.json'

/** The on-disk configuration profile envelope. */
export interface ConfigProfile {
  /** Always {@link APP_NAME}; identifies the file as this app's profile. */
  app: string
  schemaVersion: number
  /** ISO-8601 timestamp stamped at export time. */
  exportedAt: string
  /** Connection settings section (optional; absent on import keeps current values). */
  connection?: ListenerConfig
  /** Telegram templates section (optional; absent on import keeps current templates). */
  telegramTemplates?: TelegramTemplatesProfile
}

/**
 * The sections resolved from an imported profile. A profile is a full snapshot:
 * a section present in the file is applied; a section **absent** from the file
 * falls back to that feature's defaults (ADR-0008), so importing restores exactly
 * the captured state. A section that is present but unusable is the one exception
 * — it is skipped (left `undefined`) so a corrupt fragment can't wipe good data.
 */
export interface ProfileSections {
  connection?: ListenerConfig
  telegram?: TelegramTemplatesProfile
}

/** The live state the exporter bundles into a profile. */
export interface ProfileInput {
  connection: ListenerConfig
  telegram: { endOfTelegram: string; types: readonly TelegramType[] }
}

/** The result of validating/parsing an untrusted profile. */
export interface ProfileParseResult {
  ok: boolean
  /** The sections to apply, present only when `ok`. */
  sections?: ProfileSections
  /** Fatal reasons the file was rejected (wrong app, not JSON, not an object). */
  errors: string[]
  /** Non-fatal notes: coerced fields, skipped/invalid sections, version mismatch. */
  warnings: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Serialises the current connection + telegram state into a profile envelope,
 * stamping the app marker, schema version, and export timestamp.
 */
export function serializeProfile(input: ProfileInput): string {
  const profile: ConfigProfile = {
    app: APP_NAME,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    connection: { ...input.connection },
    telegramTemplates: toTelegramSection(input.telegram.types, input.telegram.endOfTelegram),
  }
  return JSON.stringify(profile, null, 2)
}

/**
 * Validates an untrusted value into the sections to apply, never throwing
 * (ADR-0008 safe import). Fails only when the value is not an object or is not a
 * profile for this app. A profile is a full snapshot: each present section is
 * coerced by its owning feature's validator; a **missing** section falls back to
 * that feature's defaults so the import restores exactly the captured state. A
 * section that is present but unusable is skipped (kept as-is) rather than applied
 * partially, so a corrupt fragment cannot wipe existing data.
 */
export function validateProfile(value: unknown): ProfileParseResult {
  if (!isRecord(value)) {
    return { ok: false, errors: ['Configuration file must be a JSON object.'], warnings: [] }
  }
  if (value.app !== APP_NAME) {
    return {
      ok: false,
      errors: [`This is not a ${APP_NAME} configuration file.`],
      warnings: [],
    }
  }

  const warnings: string[] = []

  if (typeof value.schemaVersion === 'number' && Number.isFinite(value.schemaVersion)) {
    if (value.schemaVersion > PROFILE_SCHEMA_VERSION) {
      warnings.push(
        `File schema version ${value.schemaVersion} is newer than supported ` +
          `(${PROFILE_SCHEMA_VERSION}); unknown fields are ignored.`,
      )
    }
  } else {
    warnings.push('Missing or invalid schema version; assumed the current version.')
  }

  const sections: ProfileSections = {}

  if ('connection' in value) {
    if (isRecord(value.connection)) {
      const { config, warnings: connectionWarnings } = sanitizeConnectionConfig(value.connection)
      sections.connection = config
      warnings.push(...connectionWarnings.map((warning) => `Connection: ${warning}`))
    } else {
      warnings.push('Connection section skipped (not an object); kept current settings.')
    }
  } else {
    sections.connection = { ...DEFAULT_CONFIG }
    warnings.push('No connection settings in file; reset to defaults.')
  }

  if ('telegramTemplates' in value) {
    const result = validateTelegramTemplates(value.telegramTemplates)
    if (result.ok && result.profile) {
      sections.telegram = result.profile
      warnings.push(...result.errors.map((error) => `Telegram templates: ${error}`))
    } else {
      const reason = result.errors[0] ?? 'Section was invalid.'
      warnings.push(`Telegram templates section skipped (${reason}); kept current templates.`)
    }
  } else {
    sections.telegram = toTelegramSection(SEED_TELEGRAM_TYPES, DEFAULT_END_OF_TELEGRAM)
    warnings.push('No telegram templates in file; reset to defaults.')
  }

  return { ok: true, sections, errors: [], warnings }
}

/** Parses + validates a JSON profile string, never throwing on bad input. */
export function parseProfile(json: string): ProfileParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, errors: [`Invalid JSON: ${message}`], warnings: [] }
  }
  return validateProfile(parsed)
}

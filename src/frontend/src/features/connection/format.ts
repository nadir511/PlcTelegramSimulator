import type { ListenerConfig, TrafficEntry } from './types'

/** Formats epoch milliseconds as `HH:MM:SS.mmm` (24h, local time). */
export function formatTimestamp(epochMs: number): string {
  const date = new Date(epochMs)
  const pad = (value: number, size = 2) => String(value).padStart(size, '0')
  return (
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}`
  )
}

/** Renders bytes as space-separated, upper-case, two-digit hex. */
export function formatHex(payload: readonly number[]): string {
  return payload
    .map((byte) => (byte & 0xff).toString(16).toUpperCase().padStart(2, '0'))
    .join(' ')
}

/** Renders bytes as printable ASCII; non-printable bytes become `.`. */
export function formatAscii(payload: readonly number[]): string {
  return payload
    .map((byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.'))
    .join('')
}

/**
 * Parses a hex string into byte values. Accepts common separators (spaces,
 * commas, colons, dashes) and an optional `0x` prefix. Returns `null` when the
 * input is malformed (odd digit count or a non-hex character).
 */
export function parseHex(input: string): number[] | null {
  const cleaned = input.replace(/0x/gi, '').replace(/[\s,:_-]+/g, '')
  if (cleaned === '') return []
  if (cleaned.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(cleaned)) return null

  const bytes: number[] = []
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes.push(Number.parseInt(cleaned.slice(i, i + 2), 16))
  }
  return bytes
}

/**
 * Parses text into byte values (one per character, Latin-1 range). Returns
 * `null` if any character falls outside a single byte (code point > 0xff).
 */
export function parseAscii(input: string): number[] | null {
  const bytes: number[] = []
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0
    if (code > 0xff) return null
    bytes.push(code)
  }
  return bytes
}

export type ConfigErrors = Partial<Record<keyof ListenerConfig, string>>

const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

/** Validates listener config; returns a message per invalid field. */
export function validateConfig(config: ListenerConfig): ConfigErrors {
  const errors: ConfigErrors = {}

  if (config.bindAddress.trim() === '') {
    errors.bindAddress = 'Bind address is required'
  } else if (!IPV4_PATTERN.test(config.bindAddress.trim())) {
    errors.bindAddress = 'Enter a valid IPv4 address (e.g. 0.0.0.0)'
  }

  const portError = (value: number): string | undefined =>
    !Number.isInteger(value) || value < 1 || value > 65535
      ? 'Port must be between 1 and 65535'
      : undefined

  const sendPortError = portError(config.sendPort)
  if (sendPortError) errors.sendPort = sendPortError

  const receivePortError = portError(config.receivePort)
  if (receivePortError) {
    errors.receivePort = receivePortError
  } else if (!sendPortError && config.sendPort === config.receivePort) {
    errors.receivePort = 'Send and receive ports must differ'
  }

  if (!Number.isInteger(config.processingDelayMs) || config.processingDelayMs < 0) {
    errors.processingDelayMs = 'Delay must be 0 ms or greater'
  } else if (config.processingDelayMs > 60000) {
    errors.processingDelayMs = 'Delay must be 60000 ms or less'
  }

  return errors
}

/** Tx/Rx throughput over a trailing window, plus running totals. */
export interface TrafficRate {
  txPerSecond: number
  rxPerSecond: number
  txTotal: number
  rxTotal: number
}

export function computeTrafficRate(
  entries: readonly TrafficEntry[],
  now: number,
  windowMs = 1000,
): TrafficRate {
  let txPerSecond = 0
  let rxPerSecond = 0
  let txTotal = 0
  let rxTotal = 0

  for (const entry of entries) {
    if (entry.level === 'out') {
      txTotal += 1
      if (now - entry.timestamp <= windowMs) txPerSecond += 1
    } else if (entry.level === 'in') {
      rxTotal += 1
      if (now - entry.timestamp <= windowMs) rxPerSecond += 1
    }
  }

  return { txPerSecond, rxPerSecond, txTotal, rxTotal }
}

import { describe, expect, it } from 'vitest'
import {
  computeTrafficRate,
  formatAscii,
  formatHex,
  formatTimestamp,
  parseAscii,
  parseHex,
  validateConfig,
} from './format'
import type { ListenerConfig, TrafficEntry } from './types'

const BASE_CONFIG: ListenerConfig = {
  bindAddress: '0.0.0.0',
  sendPort: 2000,
  receivePort: 2001,
  processingDelayMs: 50,
  autoAcceptReconnections: true,
}

describe('formatHex', () => {
  it('renders bytes as space-separated upper-case hex', () => {
    expect(formatHex([0x02, 0x4d, 0x03])).toBe('02 4D 03')
  })

  it('masks values to a single byte', () => {
    expect(formatHex([0x1ff])).toBe('FF')
  })

  it('returns an empty string for no bytes', () => {
    expect(formatHex([])).toBe('')
  })
})

describe('formatAscii', () => {
  it('renders printable characters and dots for the rest', () => {
    expect(formatAscii([0x02, 0x41, 0x42, 0x03])).toBe('.AB.')
  })
})

describe('formatTimestamp', () => {
  it('pads to HH:MM:SS.mmm', () => {
    const epoch = new Date(2024, 0, 1, 9, 5, 3, 7).getTime()
    expect(formatTimestamp(epoch)).toBe('09:05:03.007')
  })
})

describe('validateConfig', () => {
  it('accepts a valid config', () => {
    expect(validateConfig(BASE_CONFIG)).toEqual({})
  })

  it('rejects a blank bind address', () => {
    expect(validateConfig({ ...BASE_CONFIG, bindAddress: '  ' }).bindAddress).toBeDefined()
  })

  it('rejects a malformed IPv4 address', () => {
    expect(validateConfig({ ...BASE_CONFIG, bindAddress: '999.1.1.1' }).bindAddress).toBeDefined()
  })

  it('rejects an out-of-range send or receive port', () => {
    expect(validateConfig({ ...BASE_CONFIG, sendPort: 0 }).sendPort).toBeDefined()
    expect(validateConfig({ ...BASE_CONFIG, receivePort: 70000 }).receivePort).toBeDefined()
  })

  it('rejects a NaN port (empty field)', () => {
    expect(validateConfig({ ...BASE_CONFIG, sendPort: Number.NaN }).sendPort).toBeDefined()
  })

  it('rejects equal send and receive ports', () => {
    expect(
      validateConfig({ ...BASE_CONFIG, sendPort: 3000, receivePort: 3000 }).receivePort,
    ).toBeDefined()
  })

  it('rejects a negative processing delay', () => {
    expect(validateConfig({ ...BASE_CONFIG, processingDelayMs: -1 }).processingDelayMs).toBeDefined()
  })

  it('rejects a processing delay above the ceiling', () => {
    expect(
      validateConfig({ ...BASE_CONFIG, processingDelayMs: 60001 }).processingDelayMs,
    ).toBeDefined()
  })
})

describe('computeTrafficRate', () => {
  const now = 10_000

  const entry = (level: TrafficEntry['level'], timestamp: number): TrafficEntry => ({
    id: `${level}-${timestamp}`,
    timestamp,
    level,
  })

  it('counts totals and windowed throughput by direction', () => {
    const entries: TrafficEntry[] = [
      entry('out', now - 100),
      entry('out', now - 500),
      entry('out', now - 5000),
      entry('in', now - 200),
      entry('system', now),
      entry('error', now),
    ]

    const rate = computeTrafficRate(entries, now)

    expect(rate.txTotal).toBe(3)
    expect(rate.rxTotal).toBe(1)
    expect(rate.txPerSecond).toBe(2)
    expect(rate.rxPerSecond).toBe(1)
  })

  it('returns zeroes for an empty log', () => {
    expect(computeTrafficRate([], now)).toEqual({
      txPerSecond: 0,
      rxPerSecond: 0,
      txTotal: 0,
      rxTotal: 0,
    })
  })
})

describe('parseHex', () => {
  it('parses spaced and contiguous hex into bytes', () => {
    expect(parseHex('02 4D 03')).toEqual([0x02, 0x4d, 0x03])
    expect(parseHex('024d03')).toEqual([0x02, 0x4d, 0x03])
  })

  it('accepts separators and 0x prefixes', () => {
    expect(parseHex('0x02:0x4D-03')).toEqual([0x02, 0x4d, 0x03])
  })

  it('treats blank input as an empty payload', () => {
    expect(parseHex('   ')).toEqual([])
  })

  it('returns null for malformed hex', () => {
    expect(parseHex('ZZ')).toBeNull()
    expect(parseHex('4D3')).toBeNull()
  })
})

describe('parseAscii', () => {
  it('maps characters to byte values', () => {
    expect(parseAscii('MP01')).toEqual([0x4d, 0x50, 0x30, 0x31])
    expect(parseAscii('é')).toEqual([0xe9])
  })

  it('returns null for characters outside a single byte', () => {
    expect(parseAscii('😀')).toBeNull()
  })
})

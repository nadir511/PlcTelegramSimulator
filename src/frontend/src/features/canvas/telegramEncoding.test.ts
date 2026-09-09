import { describe, expect, it } from 'vitest'
import { SEED_TELEGRAM_TYPES } from '../telegrams/defaults'
import type { TelegramType } from '../telegrams/types'
import { encodeArrivalTelegram } from './telegramEncoding'
import type { SensorProps } from './types'

/** The seeded telegram type with the given code, or a hard failure if it's gone. */
function seedType(code: string): TelegramType {
  const type = SEED_TELEGRAM_TYPES.find((candidate) => candidate.code === code)
  if (!type) throw new Error(`seed telegram type "${code}" not found`)
  return type
}

/** The default MP type: the common message header (Sender…ErrorCode). */
const mpType = seedType('MP')

describe('encodeArrivalTelegram', () => {
  it('encodes the seeded MP type to the full header frame with the minted id (no terminator)', () => {
    // The seed MP type has no MP/TU field, so these bindings don't apply and every
    // field except TelegramId falls back to its template default — the full header on
    // the wire, with the frontend-minted id (1) encoded into the reserved slot.
    const sensor: SensorProps = {
      telegramTypeId: 'MP',
      mpId: 'MP1',
      fieldBindings: [
        { field: 'MP', source: 'mpId' },
        { field: 'TU', source: 'bin.tuId' },
      ],
    }

    const result = encodeArrivalTelegram(mpType, sensor, { tuId: 'TU-7' }, 1)

    expect(result).not.toBeNull()
    if (!result) return
    // The backend appends the End-of-Telegram terminator on send (ADR-0018), so the
    // encoded telegram ends at ErrorCode with no terminator byte here.
    expect(result).toEqual([
      0x43, 0x56, // Sender  = 'CV'
      0x30, 0x31, // Receiver = '01'
      0x00, 0x01, // TelegramId = 1 (INT, big-endian) — the frontend-minted id
      0x4e, 0x00, // Status  = 'N' right-padded with NUL
      0x4d, 0x50, // TelegramType = 'MP'
      0x00, 0x00, // ErrorCode = 0 (INT)
    ])
    // Every byte is a real wire byte (0..255), never a null placeholder.
    expect(result.every((byte) => byte >= 0 && byte <= 0xff)).toBe(true)
    expect(result[result.length - 1]).toBe(0x00)
  })

  it('encodes the minted TelegramId into the reserved slot (big-endian INT)', () => {
    const sensor: SensorProps = { telegramTypeId: 'MP', mpId: 'MP1', fieldBindings: [] }

    // TelegramId sits after Sender(2) + Receiver(2) => offset 4, INT width 2.
    const result = encodeArrivalTelegram(mpType, sensor, { tuId: 'TU-7' }, 42)

    expect(result).not.toBeNull()
    if (!result) return
    // 42 = 0x002A big-endian in the 2-byte slot at offset 4.
    expect(result.slice(4, 6)).toEqual([0x00, 0x2a])
  })

  it('pads a short TelegramId per the field config (empty/short filled with the pad char)', () => {
    // A STRING TelegramId width 6 left-padded with space: id 1 -> "     1".
    const stringIdType: TelegramType = {
      code: 'SID',
      name: 'StringId',
      description: 'type whose TelegramId is a space-padded string',
      groups: [
        {
          id: 'g1',
          name: 'Body',
          fields: [
            {
              id: 'f-id',
              name: 'TelegramId',
              dataType: 'STRING',
              length: 6,
              defaultValue: '',
              padSide: 'left',
              padValue: ' ',
            },
          ],
        },
      ],
    }
    const sensor: SensorProps = { telegramTypeId: 'SID', mpId: 'MP1', fieldBindings: [] }

    const result = encodeArrivalTelegram(stringIdType, sensor, { tuId: 'TU-7' }, 1)

    expect(result).not.toBeNull()
    if (!result) return
    // "     1" — five spaces (0x20) then '1' (0x31).
    expect(result).toEqual([0x20, 0x20, 0x20, 0x20, 0x20, 0x31])
  })

  it('fills bound fields from the sensor mpId and the bin tuId (case-insensitive)', () => {
    const boundType: TelegramType = {
      code: 'BND',
      name: 'Bound',
      description: 'test type with MP/TU body fields',
      groups: [
        {
          id: 'g1',
          name: 'Body',
          fields: [
            { id: 'f-mp', name: 'MP', dataType: 'STRING', length: 2, defaultValue: 'XX' },
            { id: 'f-tu', name: 'TU', dataType: 'STRING', length: 4, defaultValue: 'ZZZZ' },
          ],
        },
      ],
    }
    const sensor: SensorProps = {
      telegramTypeId: 'BND',
      mpId: 'M1',
      // Lowercase binding names still match the fields (MP / TU) case-insensitively.
      fieldBindings: [
        { field: 'mp', source: 'mpId' },
        { field: 'tu', source: 'bin.tuId' },
      ],
    }

    const result = encodeArrivalTelegram(boundType, sensor, { tuId: 'TU42' }, 1)

    expect(result).not.toBeNull()
    if (!result) return
    // MP <- mpId 'M1'; TU <- bin tuId 'TU42'.
    expect(result).toEqual([
      0x4d, 0x31, // 'M1'
      0x54, 0x55, 0x34, 0x32, // 'TU42'
    ])
  })

  it('returns null when a field is auto (computed at send time)', () => {
    const autoType: TelegramType = {
      code: 'AUT',
      name: 'Auto',
      description: 'type with a computed checksum field',
      groups: [
        {
          id: 'g1',
          name: 'Body',
          fields: [
            { id: 'f-a', name: 'Sender', dataType: 'STRING', length: 2, defaultValue: 'CV' },
            { id: 'f-crc', name: 'CRC', dataType: 'HEX', length: 2, defaultValue: '', auto: true },
          ],
        },
      ],
    }
    const sensor: SensorProps = { telegramTypeId: 'AUT', mpId: 'MP1', fieldBindings: [] }

    expect(encodeArrivalTelegram(autoType, sensor, { tuId: 'TU-7' }, 1)).toBeNull()
  })

  it('returns null when a field value cannot be encoded to wire bytes', () => {
    const badType: TelegramType = {
      code: 'BAD',
      name: 'Bad',
      description: 'type with a non-Latin-1 default',
      groups: [
        {
          id: 'g1',
          name: 'Body',
          // '€' (U+20AC) is not a single Latin-1 byte -> unresolved -> whole telegram nulls out.
          fields: [{ id: 'f', name: 'Body', dataType: 'STRING', length: 1, defaultValue: '€' }],
        },
      ],
    }
    const sensor: SensorProps = { telegramTypeId: 'BAD', mpId: 'MP1', fieldBindings: [] }

    expect(encodeArrivalTelegram(badType, sensor, { tuId: 'TU-7' }, 1)).toBeNull()
  })
})

/**
 * Encodes the *complete* telegram a sensor emits when a bin reaches it (ADR-0009).
 *
 * The Telegram Builder templates live only in the frontend, and the tested
 * {@link ../telegrams/format} encoder is the single source of truth for byte
 * layout (data types, padding). So the canvas encodes the full telegram here —
 * bound fields filled, the correlation `TelegramId` field filled with the
 * frontend-minted id, defaults elsewhere — and the backend relays the resulting
 * bytes verbatim (no id stamping: the id already lives in the frame). The
 * End-of-Telegram terminator is *not* appended here: the backend owns it and
 * appends the session's configured terminator to every outbound telegram
 * (ADR-0018), so appending it frontend-side too would double it.
 *
 * When the telegram can't be fully finalised frontend-side — an `auto`/checksum
 * field, or any byte that can't be resolved — {@link encodeArrivalTelegram} returns
 * `null` so the caller omits the payload and the backend falls back to its interim
 * MP codec (still correlating on the supplied id). All emitted bytes are guaranteed
 * to be `0..255` (never `null`).
 */

import { allFields, encodeField } from '../telegrams/format'
import type { TelegramField, TelegramType } from '../telegrams/types'
import type { Bin, SensorProps } from './types'

/** Whether two field names refer to the same field (case-insensitive, trimmed). */
function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * The value a field encodes to: the frontend-minted correlation id for the
 * `TelegramId` field, a bound runtime source (`mpId` → the sensor's MP, `bin.tuId` →
 * the transport unit) when the sensor binds this field, otherwise the template
 * default. Encoding the id through the field's own data type / padding
 * ({@link encodeField}) means an empty or short id fills per the field's configured
 * pad character (ADR-0014) — exactly as a real device would frame it.
 */
function resolveFieldValue(
  field: TelegramField,
  sensor: SensorProps,
  bin: Pick<Bin, 'tuId'>,
  telegramId: number,
): string {
  if (namesMatch(field.name, 'TelegramId')) return String(telegramId)
  const binding = sensor.fieldBindings.find((candidate) => namesMatch(candidate.field, field.name))
  if (!binding) return field.defaultValue
  return binding.source === 'mpId' ? sensor.mpId : bin.tuId
}

/**
 * Encodes the sensor's complete telegram for a bin arrival (ADR-0009): every field
 * of the bound {@link TelegramType} in order — the `TelegramId` field taking the
 * minted `telegramId`, bound fields taking their runtime value, the rest their
 * template default. The End-of-Telegram terminator is deliberately *not* appended
 * (the backend appends the session's configured terminator on send — ADR-0018).
 * Returns `null` when the telegram can't be finalised frontend-side: any
 * `auto`/checksum field, or any field byte that can't be resolved to `0..255`. On
 * success every entry in the returned array is a byte `0..255`, and the backend
 * sends it unchanged (aside from framing).
 */
export function encodeArrivalTelegram(
  type: TelegramType,
  sensor: SensorProps,
  bin: Pick<Bin, 'tuId'>,
  telegramId: number,
): number[] | null {
  const fields = allFields(type.groups)

  const payload: number[] = []
  for (const field of fields) {
    // An auto/checksum field is computed at send time (it may even depend on the
    // id): it can't be finalised here, so the whole telegram falls back to interim.
    if (field.auto) return null

    const value = resolveFieldValue(field, sensor, bin, telegramId)
    const bytes = encodeField({ ...field, defaultValue: value })
    for (const byte of bytes) {
      // An unresolved byte (bad hex, non-Latin-1 char, invalid int) can't go on the
      // wire — bail so the backend uses its interim codec rather than a broken frame.
      if (byte === null) return null
      payload.push(byte)
    }
  }

  return payload
}

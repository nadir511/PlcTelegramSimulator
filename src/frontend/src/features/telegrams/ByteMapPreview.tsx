import { END_OF_TELEGRAM_ID, asciiStream, buildByteMap, formatAscii, rawStream, totalLength } from './format'
import type { TelegramField } from './types'
import { CopyButton } from '@/components/ui/CopyButton'

interface ByteMapPreviewProps {
  fields: readonly TelegramField[]
  /** End-of-Telegram terminator appended to the byte form (empty = none). */
  endOfTelegram?: string
}

interface Palette {
  label: string
  cell: string
  border: string
}

/** Computed (auto) fields render as unknown bytes in a distinct error colour. */
const AUTO: Palette = {
  label: 'text-error',
  cell: 'text-error border-error/30',
  border: 'border-error/40 bg-error/10',
}

/** The End-of-Telegram terminator renders as a filled, high-contrast group. */
const END_OF_TELEGRAM: Palette = {
  label: 'text-error font-bold',
  cell: 'text-error border-error/40',
  border: 'border-error bg-error/15',
}

/**
 * Distinct per-field colours, cycled by field position so adjacent fields never
 * share a colour and each field reads as its own byte group in the preview.
 */
const FIELD_PALETTES: readonly Palette[] = [
  {
    label: 'text-tertiary',
    cell: 'text-tertiary border-tertiary/30',
    border: 'border-tertiary/40 bg-tertiary/10',
  },
  {
    label: 'text-primary',
    cell: 'text-primary border-primary/30',
    border: 'border-primary/40 bg-primary/10',
  },
  {
    label: 'text-secondary',
    cell: 'text-secondary border-secondary/30',
    border: 'border-secondary/40 bg-secondary/10',
  },
  {
    label: 'text-traffic-out',
    cell: 'text-traffic-out border-traffic-out/30',
    border: 'border-traffic-out/40 bg-traffic-out/10',
  },
  {
    label: 'text-traffic-in',
    cell: 'text-traffic-in border-traffic-in/30',
    border: 'border-traffic-in/40 bg-traffic-in/10',
  },
]

function paletteFor(field: TelegramField, index: number): Palette {
  if (field.id === END_OF_TELEGRAM_ID) return END_OF_TELEGRAM
  return field.auto ? AUTO : FIELD_PALETTES[index % FIELD_PALETTES.length]
}

/** Read-only preview: a coloured per-field byte map (ASCII cells) plus the ASCII and raw hex streams. */
export function ByteMapPreview({ fields, endOfTelegram = '' }: ByteMapPreviewProps) {
  const map = buildByteMap(fields, endOfTelegram)
  const length = totalLength(fields, endOfTelegram)
  const stream = rawStream(fields, endOfTelegram)
  const ascii = asciiStream(fields, endOfTelegram)

  return (
    <section
      aria-labelledby="byte-map-heading"
      className="flex shrink-0 flex-col rounded border border-outline-variant bg-background"
    >
      <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container px-3 py-2">
        <span
          id="byte-map-heading"
          className="flex items-center gap-2 font-label-xs text-label-xs uppercase text-on-surface-variant"
        >
          Payload Byte Map Preview
        </span>
        <span className="font-data-mono text-data-mono text-on-surface-variant tabular-nums">
          Total Length: {length} {length === 1 ? 'Byte' : 'Bytes'}
        </span>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {map.length === 0 ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant/70">
            Add fields to preview the telegram payload.
          </p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {map.map(({ field, offset, bytes }, index) => {
              const palette = paletteFor(field, index)
              const fieldName = field.name || 'Field'
              return (
                <div key={field.id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-4 px-1">
                    <span className={`font-data-mono text-[10px] uppercase ${palette.label}`}>
                      {fieldName}
                    </span>
                    <span className="font-data-mono text-[10px] text-on-surface-variant tabular-nums">
                      {offset}
                    </span>
                  </div>
                  <div
                    role="group"
                    aria-label={`${fieldName} bytes`}
                    className={`flex flex-wrap overflow-hidden rounded border ${palette.border}`}
                  >
                    {bytes.map((byte, byteIndex) => (
                      <div
                        key={byteIndex}
                        className={`flex h-10 w-8 items-center justify-center border-r font-data-mono text-data-mono last:border-r-0 ${palette.cell}`}
                      >
                        {formatAscii(byte)}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-4 border-t border-outline-variant/30 pt-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h4 className="font-label-xs text-label-xs uppercase text-on-surface-variant">
              ASCII String
            </h4>
            <CopyButton value={ascii} label="Copy ASCII string" />
          </div>
          <p
            aria-label="ASCII stream output"
            className="whitespace-pre-wrap break-all rounded border border-outline-variant bg-surface-container-low p-2 font-data-mono text-data-mono text-on-surface"
          >
            {ascii || '—'}
          </p>

          <div className="mb-1 mt-3 flex items-center justify-between gap-2">
            <h4 className="font-label-xs text-label-xs uppercase text-on-surface-variant">
              Raw Stream Output
            </h4>
            <CopyButton value={stream} label="Copy raw stream" />
          </div>
          <p
            aria-label="Raw stream output"
            className="break-all rounded border border-outline-variant bg-surface-container-low p-2 font-data-mono text-data-mono text-on-surface"
          >
            {stream || '—'}
          </p>
        </div>
      </div>
    </section>
  )
}

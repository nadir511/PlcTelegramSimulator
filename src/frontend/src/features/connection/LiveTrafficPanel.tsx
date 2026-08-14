import { useEffect, useMemo, useRef, useState } from 'react'
import { formatAscii, formatHex, formatTimestamp } from './format'
import type { TrafficEntry, TrafficLevel } from './types'
import { Icon } from '@/components/ui/Icon'

type ViewMode = 'raw' | 'ascii'

interface LiveTrafficPanelProps {
  entries: readonly TrafficEntry[]
  onClear: () => void
}

interface LevelMeta {
  tag: string
  text: string
}

const LEVEL_META: Record<TrafficLevel, LevelMeta> = {
  out: { tag: 'OUT', text: 'text-traffic-out' },
  in: { tag: 'IN', text: 'text-traffic-in' },
  error: { tag: 'ERR', text: 'text-error' },
  system: { tag: 'SYS', text: 'text-on-surface-variant' },
}

type TrafficFilter = TrafficLevel | 'all'

const FILTER_OPTIONS: ReadonlyArray<{ value: TrafficFilter; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'out', label: 'Outbound' },
  { value: 'in', label: 'Inbound' },
  { value: 'error', label: 'Errors' },
  { value: 'system', label: 'System' },
]

function renderContent(entry: TrafficEntry, mode: ViewMode): string {
  if (entry.payload) {
    return mode === 'raw' ? formatHex(entry.payload) : formatAscii(entry.payload)
  }
  return entry.message ?? ''
}

interface ViewToggleProps {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
}

function ViewToggle({ mode, onChange }: ViewToggleProps) {
  const options: ReadonlyArray<{ value: ViewMode; label: string }> = [
    { value: 'raw', label: 'Raw (hex)' },
    { value: 'ascii', label: 'ASCII' },
  ]
  return (
    <div role="group" aria-label="Payload view" className="flex rounded border border-outline-variant p-0.5">
      {options.map((option) => {
        const selected = option.value === mode
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`rounded px-2.5 py-1 font-label-xs text-label-xs transition-colors ${
              selected ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Bottom panel: chronological telegram log with hex/ASCII rendering. */
export function LiveTrafficPanel({ entries, onClear }: LiveTrafficPanelProps) {
  const [mode, setMode] = useState<ViewMode>('ascii')
  const [filter, setFilter] = useState<TrafficFilter>('all')
  const scrollRef = useRef<HTMLDivElement>(null)

  const visible = useMemo(
    () => (filter === 'all' ? entries : entries.filter((entry) => entry.level === filter)),
    [entries, filter],
  )

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [visible.length])

  return (
    <section
      aria-labelledby="traffic-heading"
      className="flex min-h-[240px] flex-1 flex-col rounded-lg bg-surface-container-low border border-outline-variant"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-container-padding py-3">
        <div className="flex items-center gap-2">
          <Icon name="terminal" className="text-primary" />
          <h2 id="traffic-heading" className="font-title-md text-title-md text-on-surface">
            Live Traffic
          </h2>
          <span className="font-label-xs text-label-xs text-on-surface-variant tabular-nums">
            {filter === 'all'
              ? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`
              : `${visible.length} of ${entries.length}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="traffic-filter" className="sr-only">
            Filter by type
          </label>
          <select
            id="traffic-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value as TrafficFilter)}
            className="rounded border border-outline-variant bg-background px-2 py-1 font-label-xs text-label-xs text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ViewToggle mode={mode} onChange={setMode} />
          <button
            type="button"
            onClick={onClear}
            disabled={entries.length === 0}
            className="flex items-center gap-1 rounded border border-outline-variant px-2.5 py-1 font-label-xs text-label-xs text-on-surface-variant transition-colors hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="delete_sweep" />
            Clear Log
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 font-data-mono text-data-mono">
        {entries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-on-surface-variant/60">
            <Icon name="inbox" weight={300} className="text-4xl" />
            <p className="font-body-sm text-body-sm">No traffic yet — start the listener to see telegrams.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-on-surface-variant/60">
            <Icon name="filter_alt_off" weight={300} className="text-4xl" />
            <p className="font-body-sm text-body-sm">No telegrams match this filter.</p>
          </div>
        ) : (
          <ul>
            {visible.map((entry, index) => {
              const meta = LEVEL_META[entry.level]
              return (
                <li
                  key={entry.id}
                  className={`flex items-baseline gap-3 rounded px-2 py-1 ${
                    index % 2 === 1 ? 'bg-background/40' : ''
                  }`}
                >
                  <span className="shrink-0 text-on-surface-variant/70 tabular-nums">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  <span className={`w-8 shrink-0 font-medium ${meta.text}`}>{meta.tag}</span>
                  {entry.label ? (
                    <span className="shrink-0 text-on-surface-variant">[{entry.label}]</span>
                  ) : null}
                  <span className="break-all text-on-surface">{renderContent(entry, mode)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

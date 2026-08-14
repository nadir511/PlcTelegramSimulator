import { useEffect, useMemo, useState } from 'react'
import type { TrafficRate } from './format'
import { computeTrafficRate } from './format'
import type { ListenerStatus, TrafficEntry } from './types'
import { Icon } from '@/components/ui/Icon'

interface SessionStatusPanelProps {
  status: ListenerStatus
  error: string | null
  entries: readonly TrafficEntry[]
  /** Whether the config is valid enough to start the listener. */
  canStart: boolean
  onStart: () => void
  onStop: () => void
}

interface StatusMeta {
  label: string
  icon: string
  text: string
  border: string
  glow: string
  spin?: boolean
}

const STATUS_META: Record<ListenerStatus, StatusMeta> = {
  stopped: { label: 'Stopped', icon: 'power_settings_new', text: 'text-on-surface-variant', border: 'border-outline-variant', glow: '' },
  starting: { label: 'Starting', icon: 'sync', text: 'text-primary', border: 'border-primary', glow: 'glow-primary', spin: true },
  listening: { label: 'Listening', icon: 'wifi_tethering', text: 'text-tertiary', border: 'border-tertiary', glow: 'glow-warn' },
  connected: { label: 'Connected', icon: 'link', text: 'text-secondary', border: 'border-secondary', glow: 'glow-success' },
  error: { label: 'Error', icon: 'error', text: 'text-error', border: 'border-error', glow: 'glow-error' },
}

const RUNNING_STATES: ReadonlySet<ListenerStatus> = new Set(['starting', 'listening', 'connected'])

/** Ticks once per second so throughput reflects the trailing window. */
function useTrafficRate(entries: readonly TrafficEntry[]): TrafficRate {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  return useMemo(() => computeTrafficRate(entries, now), [entries, now])
}

interface RatePillProps {
  label: string
  perSecond: number
  total: number
  dotClass: string
}

function RatePill({ label, perSecond, total, dotClass }: RatePillProps) {
  const active = perSecond > 0
  return (
    <div className="flex flex-1 flex-col gap-1 rounded bg-background border border-outline-variant p-3">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${active ? dotClass : 'bg-outline-variant'}`} />
        <span className="font-label-xs text-label-xs uppercase text-on-surface-variant">{label}</span>
      </div>
      <span className="font-data-mono text-headline-md text-on-surface tabular-nums">
        {perSecond}
        <span className="font-label-xs text-label-xs text-on-surface-variant"> p/s</span>
      </span>
      <span className="font-label-xs text-label-xs text-on-surface-variant/70 tabular-nums">
        {total} total
      </span>
    </div>
  )
}

/** Middle/right column: live listener status, controls, and throughput. */
export function SessionStatusPanel({
  status,
  error,
  entries,
  canStart,
  onStart,
  onStop,
}: SessionStatusPanelProps) {
  const meta = STATUS_META[status]
  const isRunning = RUNNING_STATES.has(status)
  const rate = useTrafficRate(entries)

  return (
    <section
      aria-labelledby="session-heading"
      className="flex w-full flex-col rounded-lg bg-surface-container-low border border-outline-variant p-container-padding lg:flex-1"
    >
      <header className="mb-4 flex items-center gap-2">
        <Icon name="monitor_heart" className="text-primary" />
        <h2 id="session-heading" className="font-title-md text-title-md text-on-surface">
          Session Status
        </h2>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div
          className={`grid h-24 w-24 place-items-center rounded-xl border-2 bg-background ${meta.border} ${meta.glow}`}
        >
          <Icon
            name={meta.icon}
            filled
            weight={500}
            className={`text-4xl ${meta.text} ${meta.spin ? 'animate-spin' : ''}`}
          />
        </div>

        <p aria-live="polite" className={`font-title-md text-title-md ${meta.text}`}>
          {meta.label}
        </p>

        {isRunning ? (
          <button
            type="button"
            onClick={onStop}
            className="flex w-full items-center justify-center gap-2 rounded bg-error px-4 py-2.5 font-title-md text-title-md text-on-error transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-error focus:ring-offset-2 focus:ring-offset-surface-container-low"
          >
            <Icon name="stop" filled />
            Stop Listener
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            className="flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2.5 font-title-md text-title-md text-on-primary transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface-container-low disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="play_arrow" filled />
            Start Listener
          </button>
        )}

        {error ? (
          <p role="alert" className="text-center font-body-sm text-body-sm text-error">
            {error}
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <RatePill label="Tx" perSecond={rate.txPerSecond} total={rate.txTotal} dotClass="bg-traffic-out" />
        <RatePill label="Rx" perSecond={rate.rxPerSecond} total={rate.rxTotal} dotClass="bg-traffic-in" />
      </div>
    </section>
  )
}

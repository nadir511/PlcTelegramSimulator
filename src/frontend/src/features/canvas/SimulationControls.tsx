import { SIM_SPEEDS } from './defaults'
import type { SimSpeed, SimStatus } from './types'
import { Icon } from '@/components/ui/Icon'

interface SimulationControlsProps {
  status: SimStatus
  speed: SimSpeed
  /** Whether the bin-source pool has any bins configured (gates a fresh start). */
  canStart: boolean
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onSpeedChange: (speed: SimSpeed) => void
  /** Whether the local demo resolver is on (fabricates transport orders with no backend). */
  demoResponses: boolean
  /** Toggle the local demo resolver. */
  onDemoResponsesChange: (value: boolean) => void
  /** When true a backend is configured, so the demo toggle is disabled (live client wins). */
  demoDisabled?: boolean
}

const ROUND_BTN =
  'grid h-10 w-10 place-items-center rounded-full bg-surface-variant transition-colors hover:bg-surface-bright disabled:cursor-not-allowed disabled:opacity-40'

/** Bottom control bar overlaying the stage: transport + speed. Bins release from the pool. */
export function SimulationControls({
  status,
  speed,
  canStart,
  onPlay,
  onPause,
  onStop,
  onSpeedChange,
  demoResponses,
  onDemoResponsesChange,
  demoDisabled = false,
}: SimulationControlsProps) {
  const running = status === 'running'
  // A fresh start needs bins in the pool; resuming from paused is always allowed.
  const playDisabled = running || (status === 'idle' && !canStart)

  return (
    <div
      role="group"
      aria-label="Simulation controls"
      className="absolute bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-6 rounded-full border border-outline-variant bg-surface-container-high/95 px-6 py-3 shadow-2xl backdrop-blur-md"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPlay}
          disabled={playDisabled}
          aria-label="Play simulation"
          aria-pressed={running}
          title={
            status === 'idle' && !canStart
              ? 'Add bins to the Bin Source to start the simulation'
              : undefined
          }
          className={`${ROUND_BTN} text-on-surface`}
        >
          <Icon name="play_arrow" filled />
        </button>
        <button
          type="button"
          onClick={onPause}
          disabled={!running}
          aria-label="Pause simulation"
          className={`${ROUND_BTN} text-on-surface`}
        >
          <Icon name="pause" filled />
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={status === 'idle'}
          aria-label="Stop simulation"
          className={`${ROUND_BTN} text-error`}
        >
          <Icon name="stop" filled />
        </button>
      </div>

      <div className="h-6 w-px bg-outline-variant" />

      <div className="flex items-center gap-3">
        <span className="font-label-xs text-label-xs uppercase text-on-surface-variant">Speed</span>
        <div
          role="group"
          aria-label="Simulation speed"
          className="flex gap-1 rounded-lg border border-outline-variant bg-surface-container p-1"
        >
          {SIM_SPEEDS.map((option) => {
            const active = option === speed
            return (
              <button
                key={option}
                type="button"
                onClick={() => onSpeedChange(option)}
                aria-pressed={active}
                aria-label={`${option}x speed`}
                className={`rounded px-2 py-1 font-data-mono text-[11px] transition-colors ${
                  active
                    ? 'bg-secondary-fixed text-on-secondary-fixed'
                    : 'text-on-surface hover:bg-surface-variant'
                }`}
              >
                {option}x
              </button>
            )
          })}
        </div>
      </div>

      <div className="h-6 w-px bg-outline-variant" />

      <label
        className={`flex items-center gap-2 font-label-xs text-label-xs uppercase text-on-surface-variant ${
          demoDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        }`}
        title={
          demoDisabled
            ? 'A backend is connected — the live client provides real transport orders.'
            : 'When off (and no backend connected), bins hold at message points awaiting a real transport-order response.'
        }
      >
        <input
          type="checkbox"
          checked={demoResponses}
          disabled={demoDisabled}
          onChange={(event) => onDemoResponsesChange(event.target.checked)}
          className="h-4 w-4 accent-primary disabled:cursor-not-allowed"
        />
        Simulate responses (demo)
      </label>
    </div>
  )
}

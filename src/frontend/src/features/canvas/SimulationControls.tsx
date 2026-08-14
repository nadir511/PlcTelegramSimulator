import { SIM_SPEEDS } from './defaults'
import type { SimSpeed, SimStatus } from './types'
import { Icon } from '@/components/ui/Icon'

interface SimulationControlsProps {
  status: SimStatus
  speed: SimSpeed
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onSpeedChange: (speed: SimSpeed) => void
  onSpawnBin: () => void
}

const ROUND_BTN =
  'grid h-10 w-10 place-items-center rounded-full bg-surface-variant transition-colors hover:bg-surface-bright disabled:cursor-not-allowed disabled:opacity-40'

/** Bottom control bar overlaying the stage: transport, speed, and bin spawning. */
export function SimulationControls({
  status,
  speed,
  onPlay,
  onPause,
  onStop,
  onSpeedChange,
  onSpawnBin,
}: SimulationControlsProps) {
  const running = status === 'running'

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
          disabled={running}
          aria-label="Play simulation"
          aria-pressed={running}
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

      <button
        type="button"
        onClick={onSpawnBin}
        className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 font-label-xs text-label-xs uppercase text-on-primary transition-colors hover:bg-primary-fixed-dim"
      >
        <Icon name="add_box" className="text-[16px]" />
        Spawn Bin
      </button>
    </div>
  )
}

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasPage } from './CanvasPage'
import { parseLayout } from './layout'
import type { CanvasLayout, Component } from './types'

// react-konva can't render under jsdom (no <canvas>), so swap every primitive for
// a plain <div>. The factory is hoisted, so it must be fully self-contained: it
// pulls React via a dynamic import and forwards only click + text.
vi.mock('react-konva', async () => {
  const RK = await import('react')
  const make =
    (name: string) =>
    ({
      children,
      text,
      onClick,
      onTap,
    }: {
      children?: React.ReactNode
      text?: React.ReactNode
      onClick?: (event: unknown) => void
      onTap?: (event: unknown) => void
    }) =>
      RK.createElement('div', { onClick: onClick ?? onTap, 'data-konva': name }, text ?? children)
  return {
    Stage: make('Stage'),
    Layer: make('Layer'),
    Group: make('Group'),
    Rect: make('Rect'),
    Circle: make('Circle'),
    Line: make('Line'),
    Arc: make('Arc'),
    Arrow: make('Arrow'),
    Path: make('Path'),
    Text: make('Text'),
    Shape: make('Shape'),
  }
})

/** A minimal, valid seed layout; override any section per test. */
function makeSeed(overrides: Partial<CanvasLayout> = {}): CanvasLayout {
  return {
    schemaVersion: 1,
    units: { pixelsPerMeter: 40, lengthUnit: 'm' },
    components: [],
    connections: [],
    binSource: { id: 'src', types: [{ typeId: 'TOTE', color: '#3b82f6', count: 5 }] },
    areas: [],
    controlLogic: { minBinDistanceMeters: 0.3, conveyorSpeedScale: 1 },
    ...overrides,
  }
}

const beltComponent: Component = {
  id: 'b1',
  kind: 'straight-belt',
  label: 'Belt',
  position: { x: 100, y: 200 },
  rotation: 0,
  geometry: { lengthMeters: 5, widthMeters: 0.6, direction: 'east' },
  ports: [
    { id: 'b1:in', role: 'in' },
    { id: 'b1:out', role: 'out' },
  ],
  transport: { speedMps: 0.5, state: 'Running', maxWeightKg: 50, friction: 0.2 },
}

const sensorComponent: Component = {
  id: 'mp-1',
  kind: 'mp-sensor',
  label: 'MP Sensor',
  position: { x: 120, y: 120 },
  rotation: 0,
  geometry: { lengthMeters: 0.4, widthMeters: 0.4 },
  ports: [],
  sensor: {
    telegramTypeId: 'MP',
    mpId: 'MP1',
    fieldBindings: [
      { field: 'MP', source: 'mpId' },
      { field: 'TU', source: 'bin.tuId' },
    ],
  },
}

function inspector() {
  return within(screen.getByRole('complementary', { name: 'Property inspector' }))
}

beforeEach(() => {
  localStorage.clear()
  // Neutralise the preview clock so playing doesn't schedule real frames in tests.
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('CanvasPage palette', () => {
  it('renders the grouped palette with add buttons', () => {
    render(<CanvasPage seed={makeSeed()} />)
    expect(screen.getByText('Transport')).toBeInTheDocument()
    expect(screen.getByText('Sensors')).toBeInTheDocument()
    expect(screen.getByText('Environment')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Straight Belt' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Curved Belt' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add MP Sensor' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Sink' })).toBeInTheDocument()
  })

  it('adds a component and selects it in the inspector', () => {
    render(<CanvasPage seed={makeSeed()} />)
    expect(inspector().getByText(/select a component/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add Straight Belt' }))

    expect(inspector().getByRole('heading', { name: 'Straight Belt' })).toBeInTheDocument()
    expect(inspector().getByLabelText('Speed (m/s)')).toBeInTheDocument()
  })
})

describe('CanvasPage property inspector', () => {
  it('removes the selected component via the delete button', () => {
    render(<CanvasPage seed={makeSeed()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Straight Belt' }))
    expect(inspector().getByLabelText('Speed (m/s)')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete component' }))
    expect(inspector().getByText(/select a component/i)).toBeInTheDocument()
  })

  it('enables Apply when a transport speed changes, persists it, and reverts', () => {
    render(<CanvasPage seed={makeSeed()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Straight Belt' }))

    const apply = screen.getByRole('button', { name: 'Apply' })
    expect(apply).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Speed (m/s)'), { target: { value: '1.5' } })
    expect(apply).toBeEnabled()

    fireEvent.click(apply)
    expect(apply).toBeDisabled()
    expect(screen.getByLabelText('Speed (m/s)')).toHaveValue(1.5)

    fireEvent.change(screen.getByLabelText('Speed (m/s)'), { target: { value: '2.5' } })
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Revert' }))
    expect(screen.getByLabelText('Speed (m/s)')).toHaveValue(1.5)
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
  })

  it('edits a sensor MP ID and applies it', () => {
    render(<CanvasPage seed={makeSeed({ components: [sensorComponent] })} />)

    const mpId = inspector().getByLabelText('MP ID')
    expect(mpId).toHaveValue('MP1')

    const apply = screen.getByRole('button', { name: 'Apply' })
    expect(apply).toBeDisabled()

    fireEvent.change(mpId, { target: { value: 'MP99' } })
    expect(apply).toBeEnabled()
    fireEvent.click(apply)
    expect(apply).toBeDisabled()
    expect(inspector().getByLabelText('MP ID')).toHaveValue('MP99')
  })

  it('lists the bound telegram type options', () => {
    render(<CanvasPage seed={makeSeed({ components: [sensorComponent] })} />)
    const telegramType = inspector().getByLabelText('Telegram Type')
    expect(telegramType).toHaveValue('MP')
  })
})

describe('CanvasPage export / import', () => {
  it('exports layout JSON that parseLayout accepts', () => {
    render(<CanvasPage seed={makeSeed({ components: [beltComponent] })} />)
    expect(screen.queryByLabelText('Exported layout JSON')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Export layout' }))

    const textarea = screen.getByLabelText('Exported layout JSON') as HTMLTextAreaElement
    const parsed = parseLayout(textarea.value)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.layout.components[0].label).toBe('Belt')
  })

  it('imports a valid layout and replaces the current one', async () => {
    render(<CanvasPage seed={makeSeed({ components: [{ ...beltComponent, id: 'seed-belt' }] })} />)

    const imported = makeSeed({
      components: [{ ...beltComponent, id: 'imp-1', label: 'IMPORTED BELT' }],
    })
    const file = new File([JSON.stringify(imported)], 'layout.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('Import layout'), { target: { files: [file] } })

    // On-canvas labels are gone; verify the replace by exporting the new layout.
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Export layout' }))
      const textarea = screen.getByLabelText('Exported layout JSON') as HTMLTextAreaElement
      expect(textarea.value).toContain('imp-1')
      expect(textarea.value).not.toContain('seed-belt')
    })
  })
})

describe('CanvasPage simulation controls', () => {
  it('walks the play / pause / stop state machine', () => {
    render(<CanvasPage seed={makeSeed()} />)
    const play = screen.getByRole('button', { name: 'Play simulation' })
    const pause = screen.getByRole('button', { name: 'Pause simulation' })
    const stop = screen.getByRole('button', { name: 'Stop simulation' })

    expect(play).toBeEnabled()
    expect(pause).toBeDisabled()
    expect(stop).toBeDisabled()

    fireEvent.click(play)
    expect(play).toBeDisabled()
    expect(pause).toBeEnabled()
    expect(stop).toBeEnabled()

    fireEvent.click(pause)
    expect(play).toBeEnabled()
    expect(pause).toBeDisabled()

    fireEvent.click(play)
    fireEvent.click(stop)
    expect(stop).toBeDisabled()
    expect(play).toBeEnabled()
  })

  it('selects a playback speed', () => {
    render(<CanvasPage seed={makeSeed()} />)
    const twoX = screen.getByRole('button', { name: '2x speed' })
    const oneX = screen.getByRole('button', { name: '1x speed' })

    fireEvent.click(twoX)
    expect(twoX).toHaveAttribute('aria-pressed', 'true')
    expect(oneX).toHaveAttribute('aria-pressed', 'false')
  })

  it('spawns a preview bin', () => {
    render(<CanvasPage seed={makeSeed({ components: [beltComponent] })} />)
    expect(screen.queryByText('TOTE')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Spawn Bin' }))
    expect(screen.getByText('TOTE')).toBeInTheDocument()
  })
})

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

const sourceComponent: Component = {
  id: 'src-c',
  kind: 'bin-source',
  label: 'Source',
  position: { x: 40, y: 200 },
  rotation: 0,
  geometry: { lengthMeters: 1, widthMeters: 1 },
  ports: [{ id: 'src-c:out', role: 'out' }],
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

  it('closes the exported layout pane', () => {
    render(<CanvasPage seed={makeSeed({ components: [beltComponent] })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Export layout' }))
    expect(screen.getByLabelText('Exported layout JSON')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close exported layout' }))
    expect(screen.queryByLabelText('Exported layout JSON')).toBeNull()
  })

  it('saves the layout and confirms it', () => {
    render(<CanvasPage seed={makeSeed({ components: [beltComponent] })} />)
    localStorage.clear()

    fireEvent.click(screen.getByRole('button', { name: 'Save layout' }))

    expect(screen.getByRole('button', { name: 'Save layout' })).toHaveTextContent('Saved')
    expect(localStorage.getItem('plc.canvas.layout.v1')).toContain('belt')
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

  it('defaults the demo response toggle ON (no backend) and flips it off', () => {
    render(<CanvasPage seed={makeSeed()} />)
    const toggle = screen.getByRole('checkbox', { name: /simulate responses/i })
    // With no backend configured, the demo resolver is on by default so a
    // frontend-only user still sees the MP→TO→next-MP cycle.
    expect(toggle).toBeChecked()
    expect(toggle).toBeEnabled()

    fireEvent.click(toggle)
    expect(toggle).not.toBeChecked()
  })

  it('disables the demo response toggle while the simulation is running', () => {
    // Swapping the client mid-run would strand bins already held at an MP (the new
    // client never re-reports them), so the toggle is locked until the run stops.
    render(
      <CanvasPage
        seed={makeSeed({
          binSource: { id: 'src', types: [{ typeId: 'TOTE', color: '#3b82f6', count: 2 }] },
        })}
      />,
    )
    const toggle = screen.getByRole('checkbox', { name: /simulate responses/i })
    expect(toggle).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Play simulation' }))
    expect(toggle).toBeDisabled()
  })

  it('disables Play when the bin source pool is empty', () => {
    render(<CanvasPage seed={makeSeed({ binSource: { id: 'src', types: [] } })} />)
    expect(screen.getByRole('button', { name: 'Play simulation' })).toBeDisabled()
  })

  it('enables Play once the bin source pool has bins', () => {
    render(
      <CanvasPage
        seed={makeSeed({
          binSource: { id: 'src', types: [{ typeId: 'TOTE', color: '#3b82f6', count: 2 }] },
        })}
      />,
    )
    expect(screen.getByRole('button', { name: 'Play simulation' })).toBeEnabled()
  })

  it('shows the total bin count on the bin source component', () => {
    render(
      <CanvasPage
        seed={makeSeed({
          components: [sourceComponent],
          binSource: { id: 'src-c', types: [{ typeId: 'TOTE', color: '#3b82f6', count: 7 }] },
        })}
      />,
    )
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('adds a bin type from the bin source inspector', () => {
    // A single-component seed auto-selects that component, opening its inspector.
    render(<CanvasPage seed={makeSeed({ components: [sourceComponent] })} />)
    fireEvent.click(inspector().getByRole('button', { name: 'Add bin type' }))
    // The new type's id renders as an editable text input in the Bins card.
    expect(inspector().getByDisplayValue('BIN')).toBeInTheDocument()
  })

  it('edits the distance between bins from the bin source inspector', () => {
    render(<CanvasPage seed={makeSeed({ components: [sourceComponent] })} />)
    const field = inspector().getByLabelText('Distance between bins (m)') as HTMLInputElement
    expect(field.value).toBe('0.3') // default gap
    fireEvent.change(field, { target: { value: '1.2' } })
    expect((inspector().getByLabelText('Distance between bins (m)') as HTMLInputElement).value).toBe('1.2')
  })
})

describe('CanvasPage keyboard delete', () => {
  it('deletes the selected component when Delete is pressed', () => {
    render(<CanvasPage seed={makeSeed()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Straight Belt' }))
    expect(inspector().getByLabelText('Speed (m/s)')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Delete' })
    expect(inspector().getByText(/select a component/i)).toBeInTheDocument()
  })

  it('also deletes the selection on Backspace', () => {
    render(<CanvasPage seed={makeSeed()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Straight Belt' }))

    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(inspector().getByText(/select a component/i)).toBeInTheDocument()
  })

  it('ignores Delete while typing in a form field', () => {
    render(<CanvasPage seed={makeSeed()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Straight Belt' }))
    const speed = inspector().getByLabelText('Speed (m/s)')

    // The key event originates from the input, so the delete is suppressed.
    fireEvent.keyDown(speed, { key: 'Delete' })
    expect(inspector().getByLabelText('Speed (m/s)')).toBeInTheDocument()
  })
})

describe('CanvasPage save state', () => {
  it('blinks the Save button while dirty and confirms after saving', () => {
    render(<CanvasPage seed={makeSeed()} />)

    // Clean on first render.
    expect(screen.getByRole('button', { name: 'Save layout' })).not.toHaveClass('save-blink')
    expect(screen.getByRole('button', { name: 'Save layout' })).not.toHaveTextContent('Save layout *')

    // An edit makes the layout dirty → the Save button blinks and hints unsaved work.
    fireEvent.click(screen.getByRole('button', { name: 'Add Straight Belt' }))
    expect(screen.getByRole('button', { name: 'Save layout' })).toHaveClass('save-blink')
    expect(screen.getByRole('button', { name: 'Save layout' })).toHaveTextContent('Save layout *')

    // Saving clears the dirty state and shows the transient confirmation.
    fireEvent.click(screen.getByRole('button', { name: 'Save layout' }))
    expect(screen.getByRole('button', { name: 'Save layout' })).toHaveTextContent('Saved')
    expect(screen.getByRole('button', { name: 'Save layout' })).not.toHaveClass('save-blink')
  })
})

import { useEffect, useRef, useState } from 'react'
import { Arc, Arrow, Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva'
import type Konva from 'konva'
import { kindLabel } from './defaults'
import {
  CANVAS_DND_MIME,
  componentIdOfPort,
  componentPorts,
  componentSizePx,
  curveGeometry,
  isEnvironmentKind,
  isSensorKind,
  portWorldPos,
  resolvePortWorld,
  toComponentKind,
} from './layout'
import type {
  Bin,
  Component,
  ComponentKind,
  Connection,
  Direction,
  PortRole,
  Units,
  Vec2,
} from './types'

/** A connection the user is currently dragging out from a port. */
interface PendingConnection {
  fromPortId: string
  fromRole: PortRole
  /** Origin port in stage coordinates. */
  fromWorld: Vec2
  /** Current pointer in stage coordinates. */
  pointer: Vec2
}

interface SimulationStageProps {
  components: readonly Component[]
  connections: readonly Connection[]
  units: Units
  bins: readonly Bin[]
  /** Ids of sensors currently covered by a bin. */
  triggered: ReadonlySet<string>
  /** Transport-unit ids of bins awaiting their transport order (drawn with a wait ring). */
  awaitingTo: ReadonlySet<string>
  selectedId: string | null
  onSelectNode: (id: string) => void
  /** Persist a component's new pixel position after a drag. */
  onMoveNode: (id: string, position: Vec2) => void
  /** Remove a component (fired by the on-canvas delete badge). */
  onDeleteNode: (id: string) => void
  /** Add a palette component dropped onto the canvas at `position` (stage pixels). */
  onDropComponent: (kind: ComponentKind, position: Vec2) => void
  /** Link two ports after a drag-to-connect gesture (normalised out → in by the hook). */
  onConnect: (from: string, to: string) => void
  /** Remove an existing connection (fired by clicking its arrow). */
  onDeleteConnection: (from: string, to: string) => void
  /** Fired when the empty canvas (not a component) is clicked. */
  onBackgroundClick: () => void
}

/** Canvas colours (Konva can't use Tailwind classes; these mirror the design tokens). */
const COLORS = {
  beltFill: '#2b2d33',
  beltStroke: '#424754',
  rail: '#5b616f',
  roller: '#3a3d45',
  chevron: '#7f8798',
  selected: '#a4d64c',
  sensorFill: '#a4d64c',
  sensorRing: '#bff365',
  envFill: '#201f1f',
  textDim: '#c2c6d6',
  binStroke: '#ffb786',
  waitRing: '#ffd166',
  deleteBg: '#e5484d',
  deleteFg: '#ffffff',
  portIn: '#6ea8fe',
  portOut: '#a4d64c',
  connection: '#8b93a7',
} as const

/** Fallback stage size before the container is measured (e.g. under jsdom). */
const DEFAULT_SIZE = { width: 1200, height: 800 }
const MIN_ZOOM = 0.3
const MAX_ZOOM = 3
const PORT_RADIUS = 5

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** A point at `deg` degrees (clockwise, y-down) on a circle — for curved-belt rollers. */
function arcPoint(cx: number, cy: number, radius: number, deg: number): Vec2 {
  const rad = (deg * Math.PI) / 180
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
}

/**
 * The centre canvas, rendered with React-Konva. Components are draggable groups
 * positioned in canvas pixels; sizes derive from real geometry × `units`. Clicking
 * a component selects it; clicking the empty stage deselects; the wheel zooms
 * around the pointer. Dragging from a component's port draws a connection to another
 * component's port. Transient preview bins are drawn over the static topology.
 */
export function SimulationStage({
  components,
  connections,
  units,
  bins,
  triggered,
  awaitingTo,
  selectedId,
  onSelectNode,
  onMoveNode,
  onDeleteNode,
  onDropComponent,
  onConnect,
  onDeleteConnection,
  onBackgroundClick,
}: SimulationStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(DEFAULT_SIZE)
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const [pending, setPending] = useState<PendingConnection | null>(null)

  // Track the container size so the Konva stage fills it (guarded for jsdom).
  useEffect(() => {
    const element = containerRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) setSize({ width, height })
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  /** Current pointer in stage coordinates (undoing the pan/zoom transform). */
  const stagePoint = (stage: Konva.Stage | null | undefined): Vec2 | null => {
    const pointer = stage?.getPointerPosition()
    if (!pointer) return null
    return { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale }
  }

  const handleStageClick = (event: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = event.target.getStage?.()
    if (!stage || event.target === stage) onBackgroundClick()
  }

  const handleContainerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    // Real app deselects via the Konva stage; this makes the wrapper testable too.
    if (event.target === event.currentTarget) onBackgroundClick()
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(CANVAS_DND_MIME)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const raw =
      event.dataTransfer.getData(CANVAS_DND_MIME) || event.dataTransfer.getData('text/plain')
    const kind = toComponentKind(raw)
    const element = containerRef.current
    if (!kind || !element) return
    event.preventDefault()
    const rect = element.getBoundingClientRect()
    // Screen point → stage point, undoing the current pan/zoom.
    const position = {
      x: (event.clientX - rect.left - view.x) / view.scale,
      y: (event.clientY - rect.top - view.y) / view.scale,
    }
    onDropComponent(kind, position)
  }

  const handleWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault()
    const stage = event.target.getStage?.()
    const pointer = stage?.getPointerPosition()
    if (!pointer) return
    const oldScale = view.scale
    const mousePointTo = {
      x: (pointer.x - view.x) / oldScale,
      y: (pointer.y - view.y) / oldScale,
    }
    const zoomingIn = event.evt.deltaY < 0
    const newScale = clamp(zoomingIn ? oldScale * 1.05 : oldScale / 1.05, MIN_ZOOM, MAX_ZOOM)
    setView({
      scale: newScale,
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    })
  }

  const handleStageMouseMove = (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (!pending) return
    const point = stagePoint(event.target.getStage?.())
    if (point) setPending((prev) => (prev ? { ...prev, pointer: point } : prev))
  }

  const handleStageMouseUp = () => {
    // Released on empty space (a port would have handled + stopped the event).
    if (pending) setPending(null)
  }

  const handlePortDown = (portId: string, role: PortRole, world: Vec2) => {
    setPending({ fromPortId: portId, fromRole: role, fromWorld: world, pointer: world })
  }

  const handlePortUp = (portId: string, role: PortRole) => {
    setPending((prev) => {
      if (
        prev &&
        prev.fromRole !== role &&
        componentIdOfPort(prev.fromPortId) !== componentIdOfPort(portId)
      ) {
        onConnect(prev.fromPortId, portId)
      }
      return null
    })
  }

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Conveyor canvas"
      onClick={handleContainerClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="grid-bg relative flex-1 overflow-hidden rounded-lg border border-outline-variant bg-background"
    >
      <Stage
        width={size.width}
        height={size.height}
        scaleX={view.scale}
        scaleY={view.scale}
        x={view.x}
        y={view.y}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onWheel={handleWheel}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
      >
        <Layer>
          {connections.map((connection) => {
            const from = resolvePortWorld(components, units, connection.from)
            const to = resolvePortWorld(components, units, connection.to)
            if (!from || !to) return null
            return (
              <ConnectionArrow
                key={`${connection.from}->${connection.to}`}
                from={from}
                to={to}
                onDelete={() => onDeleteConnection(connection.from, connection.to)}
              />
            )
          })}

          {components.map((component) => (
            <ComponentNode
              key={component.id}
              component={component}
              units={units}
              selected={component.id === selectedId}
              triggered={triggered.has(component.id)}
              pending={pending}
              onSelectNode={onSelectNode}
              onMoveNode={onMoveNode}
              onDeleteNode={onDeleteNode}
              onPortDown={handlePortDown}
              onPortUp={handlePortUp}
            />
          ))}

          {pending ? (
            <Line
              points={[pending.fromWorld.x, pending.fromWorld.y, pending.pointer.x, pending.pointer.y]}
              stroke={COLORS.selected}
              strokeWidth={2}
              dash={[5, 4]}
              listening={false}
            />
          ) : null}

          {bins.map((bin) => (
            <Group key={bin.id} x={bin.x} y={bin.y} listening={false}>
              {awaitingTo.has(bin.tuId) && (
                <Circle
                  radius={13}
                  stroke={COLORS.waitRing}
                  strokeWidth={2}
                  dash={[3, 3]}
                  shadowColor={COLORS.waitRing}
                  shadowBlur={6}
                />
              )}
              <Rect
                x={-8}
                y={-8}
                width={16}
                height={16}
                cornerRadius={2}
                fill={bin.color}
                stroke={COLORS.binStroke}
                strokeWidth={1}
              />
              <Text text={bin.typeId} x={-20} y={10} width={40} align="center" fontSize={9} fill={COLORS.textDim} />
            </Group>
          ))}
        </Layer>
      </Stage>
    </div>
  )
}

/** An existing connection, drawn as a clickable arrow between two port world points. */
function ConnectionArrow({
  from,
  to,
  onDelete,
}: {
  from: Vec2
  to: Vec2
  onDelete: () => void
}) {
  const handleDelete = (event: Konva.KonvaEventObject<MouseEvent>) => {
    event.cancelBubble = true
    onDelete()
  }
  return (
    <Arrow
      points={[from.x, from.y, to.x, to.y]}
      stroke={COLORS.connection}
      fill={COLORS.connection}
      strokeWidth={2}
      hitStrokeWidth={12}
      pointerLength={7}
      pointerWidth={7}
      onClick={handleDelete}
      onTap={handleDelete}
    />
  )
}

interface ComponentNodeProps {
  component: Component
  units: Units
  selected: boolean
  triggered: boolean
  pending: PendingConnection | null
  onSelectNode: (id: string) => void
  onMoveNode: (id: string, position: Vec2) => void
  onDeleteNode: (id: string) => void
  onPortDown: (portId: string, role: PortRole, world: Vec2) => void
  onPortUp: (portId: string, role: PortRole) => void
}

/** One draggable, selectable component group; its shape depends on the kind. */
function ComponentNode({
  component,
  units,
  selected,
  triggered,
  pending,
  onSelectNode,
  onMoveNode,
  onDeleteNode,
  onPortDown,
  onPortUp,
}: ComponentNodeProps) {
  const size = componentSizePx(component, units)
  const ports = componentPorts(component, units)

  const handleSelect = (event: Konva.KonvaEventObject<MouseEvent>) => {
    event.cancelBubble = true
    onSelectNode(component.id)
  }

  const handleDelete = (event: Konva.KonvaEventObject<MouseEvent>) => {
    event.cancelBubble = true
    onDeleteNode(component.id)
  }

  const handleDragEnd = (event: Konva.KonvaEventObject<DragEvent>) => {
    onMoveNode(component.id, { x: event.target.x(), y: event.target.y() })
  }

  return (
    <Group
      x={component.position.x}
      y={component.position.y}
      rotation={component.rotation}
      draggable
      onClick={handleSelect}
      onTap={handleSelect}
      onDragEnd={handleDragEnd}
    >
      <ComponentShape component={component} size={size} selected={selected} triggered={triggered} units={units} />
      {ports.map((port) => (
        <PortHandle
          key={port.id}
          pos={port.pos}
          role={port.role}
          isTarget={
            !!pending &&
            pending.fromRole !== port.role &&
            componentIdOfPort(pending.fromPortId) !== component.id
          }
          onDown={() => onPortDown(port.id, port.role, portWorldPos(component, port.pos))}
          onUp={() => onPortUp(port.id, port.role)}
        />
      ))}
      {selected ? <DeleteBadge x={size.width} y={0} onDelete={handleDelete} /> : null}
    </Group>
  )
}

/** A draggable connection endpoint: press to start a link, release on another to connect. */
function PortHandle({
  pos,
  role,
  isTarget,
  onDown,
  onUp,
}: {
  pos: Vec2
  role: PortRole
  isTarget: boolean
  onDown: () => void
  onUp: () => void
}) {
  const stop = (event: Konva.KonvaEventObject<MouseEvent>) => {
    event.cancelBubble = true
  }
  return (
    <Circle
      x={pos.x}
      y={pos.y}
      radius={isTarget ? PORT_RADIUS + 1 : PORT_RADIUS}
      fill={role === 'out' ? COLORS.portOut : COLORS.portIn}
      stroke={isTarget ? COLORS.selected : COLORS.deleteFg}
      strokeWidth={isTarget ? 2 : 1}
      shadowColor={isTarget ? COLORS.selected : undefined}
      shadowBlur={isTarget ? 8 : 0}
      onMouseDown={(event) => {
        stop(event)
        onDown()
      }}
      onMouseUp={(event) => {
        stop(event)
        onUp()
      }}
      onClick={stop}
      onTap={stop}
    />
  )
}

/** A small red "×" badge shown on the selected node; clicking removes the component. */
function DeleteBadge({
  x,
  y,
  onDelete,
}: {
  x: number
  y: number
  onDelete: (event: Konva.KonvaEventObject<MouseEvent>) => void
}) {
  return (
    <Group x={x} y={y} onClick={onDelete} onTap={onDelete}>
      <Circle radius={7} fill={COLORS.deleteBg} stroke={COLORS.deleteFg} strokeWidth={1} />
      <Line points={[-3, -3, 3, 3]} stroke={COLORS.deleteFg} strokeWidth={1.5} />
      <Line points={[-3, 3, 3, -3]} stroke={COLORS.deleteFg} strokeWidth={1.5} />
    </Group>
  )
}

interface ShapeProps {
  component: Component
  size: { width: number; height: number }
  selected: boolean
  triggered: boolean
  units: Units
}

/** Draws the kind-specific vector shape inside a component's group. */
function ComponentShape({ component, size, selected, triggered, units }: ShapeProps) {
  const stroke = selected ? COLORS.selected : COLORS.beltStroke
  const strokeWidth = selected ? 2 : 1

  if (isSensorKind(component.kind)) {
    const radius = size.width / 2
    return (
      <>
        {(selected || triggered) && (
          <Circle
            x={radius}
            y={radius}
            radius={radius + 3}
            stroke={COLORS.sensorRing}
            strokeWidth={2}
            shadowColor={COLORS.sensorRing}
            shadowBlur={8}
          />
        )}
        <Circle
          x={radius}
          y={radius}
          radius={radius}
          fill={COLORS.sensorFill}
          stroke={selected ? COLORS.selected : COLORS.beltStroke}
          strokeWidth={1}
        />
      </>
    )
  }

  if (isEnvironmentKind(component.kind)) {
    return (
      <>
        <Rect
          width={size.width}
          height={size.height}
          cornerRadius={4}
          fill={COLORS.envFill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <Text
          text={kindLabel(component.kind)}
          width={size.width}
          y={size.height / 2 - 6}
          align="center"
          fontSize={10}
          fill={COLORS.textDim}
        />
      </>
    )
  }

  // Transport belts render as an actual conveyor (track + rails + direction), with
  // a shape that reflects the kind (straight / incline / decline / merge / curve / U).
  if (component.kind === 'merge') {
    return <MergeBelt size={size} stroke={stroke} strokeWidth={strokeWidth} />
  }
  if (component.kind === 'curved-belt' || component.kind === 'u-belt') {
    return <CurvedBelt component={component} units={units} stroke={stroke} strokeWidth={strokeWidth} />
  }
  return <StraightBelt component={component} size={size} stroke={stroke} strokeWidth={strokeWidth} />
}

interface BeltShapeProps {
  component: Component
  size: { width: number; height: number }
  stroke: string
  strokeWidth: number
}

/** Evenly-spaced travel chevrons that read as a moving belt surface. */
function chevrons(width: number, height: number, direction: Direction | undefined): number[][] {
  const cy = height / 2
  const arm = Math.min(6, height * 0.3)
  const half = Math.max(2, height * 0.22)
  const step = 14
  const pointsLeft = direction === 'west'
  const shapes: number[][] = []
  for (let x = step; x < width - arm; x += step) {
    shapes.push(
      pointsLeft
        ? [x + arm, cy - half, x, cy, x + arm, cy + half]
        : [x, cy - half, x + arm, cy, x, cy + half],
    )
  }
  return shapes
}

/** A straight (or incline / decline) belt: track, side rails, and travel chevrons. */
function StraightBelt({ component, size, stroke, strokeWidth }: BeltShapeProps) {
  const { width, height } = size
  const rollerStep = 12
  const rollers: number[] = []
  for (let x = rollerStep; x < width; x += rollerStep) rollers.push(x)
  const slope = component.kind === 'incline' ? 'up' : component.kind === 'decline' ? 'down' : null

  return (
    <>
      <Rect
        width={width}
        height={height}
        cornerRadius={3}
        fill={COLORS.beltFill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      {rollers.map((x) => (
        <Line key={x} points={[x, 2, x, height - 2]} stroke={COLORS.roller} strokeWidth={1} />
      ))}
      <Line points={[0, 1.5, width, 1.5]} stroke={COLORS.rail} strokeWidth={2} />
      <Line points={[0, height - 1.5, width, height - 1.5]} stroke={COLORS.rail} strokeWidth={2} />
      {chevrons(width, height, component.geometry.direction).map((points, index) => (
        <Line key={index} points={points} stroke={COLORS.chevron} strokeWidth={1.5} />
      ))}
      {slope ? <SlopeBadge slope={slope} /> : null}
    </>
  )
}

/** A small corner triangle marking an incline (points up) or decline (points down). */
function SlopeBadge({ slope }: { slope: 'up' | 'down' }) {
  const points = slope === 'up' ? [3, 9, 8, 1, 13, 9] : [3, 1, 8, 9, 13, 1]
  return <Line points={points} closed fill={COLORS.chevron} stroke={COLORS.rail} strokeWidth={1} />
}

/** A merge junction: two input lanes (each the uniform belt width) into one output. */
function MergeBelt({
  size,
  stroke,
  strokeWidth,
}: {
  size: { width: number; height: number }
  stroke: string
  strokeWidth: number
}) {
  const { width, height } = size
  const laneT = height / 2 // each lane is the uniform belt width (height = 2 lanes)
  const cy = height / 2
  const junctionX = width * 0.45
  const outTop = cy - laneT / 2
  const outBot = cy + laneT / 2

  const upperInput = [0, 0, junctionX, outTop, junctionX, outBot, 0, laneT]
  const lowerInput = [0, laneT, junctionX, outTop, junctionX, outBot, 0, height]

  return (
    <>
      <Line points={upperInput} closed fill={COLORS.beltFill} stroke={stroke} strokeWidth={strokeWidth} />
      <Line points={lowerInput} closed fill={COLORS.beltFill} stroke={stroke} strokeWidth={strokeWidth} />
      <Rect
        x={junctionX}
        y={outTop}
        width={width - junctionX}
        height={laneT}
        cornerRadius={2}
        fill={COLORS.beltFill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      {[0.62, 0.82].map((fraction) => {
        const x = width * fraction
        return (
          <Line
            key={fraction}
            points={[x, cy - laneT * 0.28, x + 5, cy, x, cy + laneT * 0.28]}
            stroke={COLORS.chevron}
            strokeWidth={1.5}
          />
        )
      })}
    </>
  )
}

/** A curved / U belt drawn as a uniform-width annular band with radial roller lines. */
function CurvedBelt({
  component,
  units,
  stroke,
  strokeWidth,
}: {
  component: Component
  units: Units
  stroke: string
  strokeWidth: number
}) {
  const curve = curveGeometry(component, units)
  const rollerCount = Math.max(2, Math.round(curve.angleDeg / 22))
  const rollers: number[][] = []
  for (let i = 1; i < rollerCount; i += 1) {
    const deg = curve.startDeg + (curve.angleDeg * i) / rollerCount
    const inner = arcPoint(curve.cx, curve.cy, curve.innerRadius, deg)
    const outer = arcPoint(curve.cx, curve.cy, curve.outerRadius, deg)
    rollers.push([inner.x, inner.y, outer.x, outer.y])
  }

  return (
    <>
      <Arc
        x={curve.cx}
        y={curve.cy}
        innerRadius={curve.innerRadius}
        outerRadius={curve.outerRadius}
        angle={curve.angleDeg}
        rotation={curve.startDeg}
        fill={COLORS.beltFill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      {rollers.map((points, index) => (
        <Line key={index} points={points} stroke={COLORS.roller} strokeWidth={1.5} />
      ))}
    </>
  )
}

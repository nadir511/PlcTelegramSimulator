import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Arc, Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva'
import type Konva from 'konva'
import {
  CANVAS_DND_MIME,
  componentPorts,
  componentSizePx,
  componentsInMarquee,
  curveGeometry,
  isEnvironmentKind,
  isSensorKind,
  isTransportKind,
  nearestComponentSnap,
  normalizeRect,
  PORT_SNAP_DISTANCE_PX,
  toComponentKind,
} from './layout'
import type { ComponentSnap, Rect as WorldRect } from './layout'
import type {
  Bin,
  BinSource,
  Component,
  ComponentKind,
  Connection,
  Direction,
  PortRole,
  Units,
  Vec2,
} from './types'

interface SimulationStageProps {
  components: readonly Component[]
  connections: readonly Connection[]
  units: Units
  /** The bin-source pool — drives the on-canvas bin glyph + total count. */
  binSource: BinSource
  /** Bins still held in the source pool — the number stamped on the source glyph. */
  binsRemaining: number
  bins: readonly Bin[]
  /** Ids of sensors currently covered by a bin. */
  triggered: ReadonlySet<string>
  /** Transport-unit ids of bins awaiting their transport order (drawn with a wait ring). */
  awaitingTo: ReadonlySet<string>
  /** When true (simulation running) transport chevrons scroll to convey belt travel. */
  animated: boolean
  selectedId: string | null
  /** Every selected component id (one via click, many via marquee) — all highlighted. */
  selectedIds: ReadonlySet<string>
  onSelectNode: (id: string) => void
  /** Replace the selection with the components inside a finished rubber-band marquee. */
  onMarqueeSelect: (ids: string[]) => void
  /**
   * Commit a component drag: magnetically snaps the piece flush to a neighbouring
   * port (forming the connection) or drops it where released, and disconnects any
   * links pulled apart. Position is in stage pixels.
   */
  onSnapNode: (id: string, position: Vec2) => void
  /** Remove a component (fired by the on-canvas delete badge). */
  onDeleteNode: (id: string) => void
  /** Add a palette component dropped onto the canvas at `position` (stage pixels). */
  onDropComponent: (kind: ComponentKind, position: Vec2) => void
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
  mpSensorFill: '#ef4444',
  mpSensorRing: '#ff8a8a',
  mpText: '#ffffff',
  envFill: '#201f1f',
  sinkHole: '#141014',
  sinkRim: '#6b7180',
  textDim: '#c2c6d6',
  binStroke: '#ffb786',
  binHighlight: '#ffffff',
  binGlyphFill: '#a4d64c',
  binGlyphRim: '#c7ef86',
  binGlyphText: '#20300f',
  waitRing: '#ffd166',
  waitRingTimedOut: '#ef4444',
  deleteBg: '#e5484d',
  deleteFg: '#ffffff',
  portIn: '#6ea8fe',
  portOut: '#a4d64c',
  connection: '#8b93a7',
  marqueeFill: 'rgba(164, 214, 76, 0.12)',
  marqueeStroke: '#a4d64c',
} as const

/** Fallback stage size before the container is measured (e.g. under jsdom). */
const DEFAULT_SIZE = { width: 1200, height: 800 }
const MIN_ZOOM = 0.3
const MAX_ZOOM = 3
const PORT_RADIUS = 6.5
/** World-px drag threshold that distinguishes a rubber-band marquee from a click. */
const MARQUEE_THRESHOLD_PX = 4

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** A point at `deg` degrees (clockwise, y-down) on a circle — for curved-belt rollers. */
function arcPoint(cx: number, cy: number, radius: number, deg: number): Vec2 {
  const rad = (deg * Math.PI) / 180
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
}

/** Full chevron travel cycles per second while a belt is running. */
const BELT_CYCLES_PER_SEC = 0.9

/**
 * A monotonically-advancing belt phase in `[0, 1)` while `active`, driven by
 * `requestAnimationFrame`. Returns a static `0` when inactive (or when rAF is
 * unavailable, e.g. under jsdom) so tests stay quiet and idle canvases don't churn.
 */
function useBeltPhase(active: boolean): number {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (!active || typeof requestAnimationFrame === 'undefined') {
      setPhase(0)
      return
    }
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const elapsed = (now - start) / 1000
      setPhase(((elapsed * BELT_CYCLES_PER_SEC) % 1 + 1) % 1)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active])
  return active ? phase : 0
}

/**
 * The centre canvas, rendered with React-Konva. Components are draggable groups
 * positioned in canvas pixels; sizes derive from real geometry × `units`. Clicking
 * a component selects it; clicking the empty stage deselects; the wheel zooms
 * around the pointer. Each component shows a **socket** (in, left) and a **plug**
 * (out, right); dragging a plug onto — or near — another component's socket links
 * them with a curved wire. Transient preview bins are drawn over the static topology.
 */
export function SimulationStage({
  components,
  connections,
  units,
  binSource,
  binsRemaining,
  bins,
  triggered,
  awaitingTo,
  animated,
  selectedId,
  selectedIds,
  onSelectNode,
  onMarqueeSelect,
  onSnapNode,
  onDeleteNode,
  onDropComponent,
  onBackgroundClick,
}: SimulationStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(DEFAULT_SIZE)
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  /** Port id currently highlighted as the live snap target during a drag. */
  const [snapTargetId, setSnapTargetId] = useState<string | null>(null)
  /** Live rubber-band selection rectangle (world px), or null when not marqueeing. */
  const [marquee, setMarquee] = useState<WorldRect | null>(null)
  const marqueeStartRef = useRef<Vec2 | null>(null)
  const marqueeRectRef = useRef<WorldRect | null>(null)
  const marqueeMovedRef = useRef(false)
  /** Set after a marquee drag so the trailing click doesn't clear the new selection. */
  const suppressClickRef = useRef(false)

  // Ports that participate in a connection render as hollow (no-fill) endpoints.
  const connectedPortIds = useMemo(() => {
    const ids = new Set<string>()
    for (const connection of connections) {
      ids.add(connection.from)
      ids.add(connection.to)
    }
    return ids
  }, [connections])

  // Magnet: the nearest opposite-role port a component would snap to at `world`.
  const computeSnap = useCallback(
    (id: string, world: Vec2): ComponentSnap | null =>
      nearestComponentSnap(components, units, id, world, PORT_SNAP_DISTANCE_PX),
    [components, units],
  )

  // Only animate belt travel while the sim is running AND at least one transport
  // belt is actually in its Running state — otherwise keep the canvas static.
  const anyBeltRunning = useMemo(
    () =>
      components.some(
        (component) => isTransportKind(component.kind) && component.transport?.state === 'Running',
      ),
    [components],
  )
  const beltPhase = useBeltPhase(animated && anyBeltRunning)

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

  const handleStageClick = (event: Konva.KonvaEventObject<MouseEvent>) => {
    // Swallow the click Konva fires at the end of a marquee drag so it doesn't
    // immediately clear the selection the rubber-band just made.
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    const stage = event.target.getStage?.()
    if (!stage || event.target === stage) onBackgroundClick()
  }

  /** Pointer position in world (stage) coordinates, undoing the current pan/zoom. */
  const worldPointFromEvent = (event: Konva.KonvaEventObject<MouseEvent>): Vec2 | null => {
    const stage = event.target.getStage?.()
    const pointer = stage?.getPointerPosition()
    if (!pointer) return null
    return { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale }
  }

  const handleStageMouseDown = (event: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = event.target.getStage?.()
    // A rubber-band only starts on empty canvas — grabbing a component drags it.
    if (!stage || event.target !== stage) return
    const point = worldPointFromEvent(event)
    if (!point) return
    marqueeStartRef.current = point
    marqueeMovedRef.current = false
    const rect: WorldRect = { x: point.x, y: point.y, width: 0, height: 0 }
    marqueeRectRef.current = rect
    setMarquee(rect)
  }

  const handleStageMouseMove = (event: Konva.KonvaEventObject<MouseEvent>) => {
    const start = marqueeStartRef.current
    if (!start) return
    const point = worldPointFromEvent(event)
    if (!point) return
    const rect: WorldRect = { x: start.x, y: start.y, width: point.x - start.x, height: point.y - start.y }
    if (Math.abs(rect.width) > MARQUEE_THRESHOLD_PX || Math.abs(rect.height) > MARQUEE_THRESHOLD_PX) {
      marqueeMovedRef.current = true
    }
    marqueeRectRef.current = rect
    setMarquee(rect)
  }

  const handleStageMouseUp = () => {
    const rect = marqueeRectRef.current
    const moved = marqueeMovedRef.current
    marqueeStartRef.current = null
    marqueeRectRef.current = null
    marqueeMovedRef.current = false
    setMarquee(null)
    if (rect && moved) {
      onMarqueeSelect(componentsInMarquee(components, units, rect))
      suppressClickRef.current = true
    }
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

  /** While dragging: light up the port this component would snap onto (or clear it). */
  const handleDragProgress = useCallback(
    (id: string, world: Vec2) => {
      setSnapTargetId((current) => {
        const next = computeSnap(id, world)?.targetPortId ?? null
        return next === current ? current : next
      })
    },
    [computeSnap],
  )

  /** On drop: clear the highlight and commit the (already snapped) position. */
  const handleDragSettle = useCallback(
    (id: string, world: Vec2) => {
      setSnapTargetId(null)
      onSnapNode(id, world)
    },
    [onSnapNode],
  )

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
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onWheel={handleWheel}
      >
        <Layer>
          {components.map((component) => (
            <ComponentNode
              key={component.id}
              component={component}
              units={units}
              view={view}
              binSource={binSource}
              binsRemaining={binsRemaining}
              selected={selectedIds.has(component.id)}
              primary={component.id === selectedId}
              triggered={triggered.has(component.id)}
              snapTargetId={snapTargetId}
              beltPhase={beltPhase}
              connectedPortIds={connectedPortIds}
              computeSnap={computeSnap}
              onSelectNode={onSelectNode}
              onDragProgress={handleDragProgress}
              onDragSettle={handleDragSettle}
              onDeleteNode={onDeleteNode}
            />
          ))}

          {marquee ? <MarqueeRect rect={marquee} /> : null}

          {bins.map((bin) => {
            // The wait ring / id label only show while a bin is held at an MP awaiting
            // its transport order; a timed-out (faulted-but-held) bin recolours the ring
            // so "still waiting after a timeout" reads distinctly from "waiting".
            const awaiting = awaitingTo.has(bin.tuId)
            const ringColor = bin.timedOut ? COLORS.waitRingTimedOut : COLORS.waitRing
            const label = awaiting ? binWaitLabel(bin) : null
            return (
              <Group key={bin.id} x={bin.x} y={bin.y} listening={false}>
                {awaiting && (
                  <Circle
                    radius={13}
                    stroke={ringColor}
                    strokeWidth={2}
                    dash={[3, 3]}
                    shadowColor={ringColor}
                    shadowBlur={6}
                  />
                )}
                {label && (
                  <Text
                    text={label}
                    x={-44}
                    y={-30}
                    width={88}
                    align="center"
                    fontFamily="'JetBrains Mono', monospace"
                    fontSize={9}
                    fill={ringColor}
                    listening={false}
                  />
                )}
                <BinGlyph color={bin.color} />
              </Group>
            )
          })}
        </Layer>
      </Stage>
    </div>
  )
}

/**
 * The awaiting/held bin's telegram id, zero-padded to a 6-digit sequence
 * (`#000001`) so each bin's MP telegram reads as a distinct, fresh id. Shown only
 * while the bin is held at a message point awaiting its transport order — the
 * routed `destinationMp` is applied at release (it moves the bin), so it is not
 * part of this held-state label.
 */
function binWaitLabel(bin: Bin): string {
  return bin.telegramId === undefined ? '#------' : `#${String(bin.telegramId).padStart(6, '0')}`
}

/**
 * A moving transport unit, drawn as a small tote/crate (trapezoid body + open rim)
 * tinted with its bin-type colour — more bin-like than a plain square.
 */
function BinGlyph({ color }: { color: string }) {
  return (
    <Group listening={false}>
      {/* Tote body: slightly tapered like an open container. */}
      <Line
        points={[-8, -5, 8, -5, 6, 8, -6, 8]}
        closed
        fill={color}
        stroke={COLORS.binStroke}
        strokeWidth={1}
        lineJoin="round"
      />
      {/* Open-top rim. */}
      <Rect
        x={-9}
        y={-8}
        width={18}
        height={4}
        cornerRadius={2}
        fill={color}
        stroke={COLORS.binStroke}
        strokeWidth={1}
      />
      {/* Soft highlight stripe reads regardless of the bin colour. */}
      <Rect x={-6} y={-2} width={12} height={2} cornerRadius={1} fill={COLORS.binHighlight} opacity={0.28} />
    </Group>
  )
}

/** The rubber-band selection rectangle (world px) — a translucent, non-interactive box. */
function MarqueeRect({ rect }: { rect: WorldRect }) {
  const box = normalizeRect(rect)
  return (
    <Rect
      x={box.x}
      y={box.y}
      width={box.width}
      height={box.height}
      fill={COLORS.marqueeFill}
      stroke={COLORS.marqueeStroke}
      strokeWidth={1}
      dash={[4, 4]}
      listening={false}
    />
  )
}

interface ComponentNodeProps {
  component: Component
  units: Units
  /** Current pan/zoom, needed to convert drag absolute ↔ stage coordinates. */
  view: { scale: number; x: number; y: number }
  binSource: BinSource
  binsRemaining: number
  selected: boolean
  /** The single inspector target — shows the on-canvas delete badge (marquee hides it). */
  primary: boolean
  triggered: boolean
  /** Port id currently highlighted as the magnetic snap target (or null). */
  snapTargetId: string | null
  beltPhase: number
  connectedPortIds: ReadonlySet<string>
  /** Nearest snap for this component at a candidate world position (or null). */
  computeSnap: (id: string, world: Vec2) => ComponentSnap | null
  onSelectNode: (id: string) => void
  /** Live drag feedback: the component is at `world` (already magnet-adjusted). */
  onDragProgress: (id: string, world: Vec2) => void
  /** Drag committed: persist the final (snapped) `world` position. */
  onDragSettle: (id: string, world: Vec2) => void
  onDeleteNode: (id: string) => void
}

/** One draggable, selectable component group; its shape depends on the kind. */
function ComponentNode({
  component,
  units,
  view,
  binSource,
  binsRemaining,
  selected,
  primary,
  triggered,
  snapTargetId,
  beltPhase,
  connectedPortIds,
  computeSnap,
  onSelectNode,
  onDragProgress,
  onDragSettle,
  onDeleteNode,
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

  /**
   * Magnetic bound: convert Konva's absolute (screen) point to stage/world space,
   * snap it flush to a nearby port when one is in range, then convert back. This
   * runs every drag frame so the piece visibly clicks into place like a puzzle.
   */
  const dragBoundFunc = (abs: Vec2): Vec2 => {
    const world = { x: (abs.x - view.x) / view.scale, y: (abs.y - view.y) / view.scale }
    const snap = computeSnap(component.id, world)
    const settled = snap ? snap.position : world
    return { x: settled.x * view.scale + view.x, y: settled.y * view.scale + view.y }
  }

  const handleDragMove = (event: Konva.KonvaEventObject<DragEvent>) => {
    onDragProgress(component.id, { x: event.target.x(), y: event.target.y() })
  }

  const handleDragEnd = (event: Konva.KonvaEventObject<DragEvent>) => {
    onDragSettle(component.id, { x: event.target.x(), y: event.target.y() })
  }

  return (
    <Group
      x={component.position.x}
      y={component.position.y}
      rotation={component.rotation}
      draggable
      dragBoundFunc={dragBoundFunc}
      onClick={handleSelect}
      onTap={handleSelect}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <ComponentShape
        component={component}
        size={size}
        binSource={binSource}
        binsRemaining={binsRemaining}
        selected={selected}
        triggered={triggered}
        units={units}
        beltPhase={beltPhase}
      />
      {ports.map((port) => (
        <PortHandle
          key={port.id}
          pos={port.pos}
          role={port.role}
          connected={connectedPortIds.has(port.id)}
          isTarget={snapTargetId === port.id}
        />
      ))}
      {primary ? <DeleteBadge x={size.width} y={0} onDelete={handleDelete} /> : null}
    </Group>
  )
}

/**
 * A role-shaped, non-interactive interlocking tab that reads like a puzzle edge:
 * the `in` port is a **socket** (a notch on the left that fills when a piece is
 * seated) and the `out` port is a **plug/knob** (a tab on the right). Components
 * are connected by dragging the whole piece so these tabs meet (magnetic snap),
 * so the tabs themselves don't handle pointer events. A port glows while it is the
 * live snap target during a drag.
 */
function PortHandle({
  pos,
  role,
  isTarget,
  connected,
}: {
  pos: Vec2
  role: PortRole
  isTarget: boolean
  connected: boolean
}) {
  const highlight = isTarget ? COLORS.selected : null
  const glow = isTarget

  if (role === 'in') {
    // Socket: a receptacle housing with a hollow hole that fills once seated.
    return (
      <Group x={pos.x} y={pos.y} listening={false}>
        <Rect
          x={-5}
          y={-9}
          width={10}
          height={18}
          cornerRadius={3}
          fill={COLORS.portIn}
          opacity={0.3}
        />
        <Circle
          radius={PORT_RADIUS}
          fill={connected ? COLORS.portOut : COLORS.beltFill}
          stroke={highlight ?? COLORS.portIn}
          strokeWidth={glow ? 3 : 2}
          shadowColor={glow ? COLORS.selected : undefined}
          shadowBlur={glow ? 10 : 0}
        />
      </Group>
    )
  }

  // Plug / hook: a knob on a short neck that seats into a socket.
  return (
    <Group x={pos.x} y={pos.y} listening={false}>
      <Rect
        x={-9}
        y={-3}
        width={11}
        height={6}
        cornerRadius={2}
        fill={COLORS.portOut}
        opacity={0.7}
      />
      <Circle
        radius={PORT_RADIUS}
        fill={COLORS.portOut}
        stroke={highlight ?? COLORS.deleteFg}
        strokeWidth={glow ? 3 : 1.5}
        shadowColor={glow ? COLORS.selected : undefined}
        shadowBlur={glow ? 10 : 0}
      />
    </Group>
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
  binSource: BinSource
  binsRemaining: number
  selected: boolean
  triggered: boolean
  units: Units
  beltPhase: number
}

/** Draws the kind-specific vector shape inside a component's group. */
function ComponentShape({ component, size, binSource, binsRemaining, selected, triggered, units, beltPhase }: ShapeProps) {
  const stroke = selected ? COLORS.selected : COLORS.beltStroke
  const strokeWidth = selected ? 2 : 1

  if (isSensorKind(component.kind)) {
    const radius = size.width / 2
    const isMp = component.kind === 'mp-sensor'
    const fill = isMp ? COLORS.mpSensorFill : COLORS.sensorFill
    const ring = isMp ? COLORS.mpSensorRing : COLORS.sensorRing
    const mpId = component.sensor?.mpId?.trim()
    return (
      <>
        {(selected || triggered) && (
          <Circle
            x={radius}
            y={radius}
            radius={radius + 3}
            stroke={ring}
            strokeWidth={2}
            shadowColor={ring}
            shadowBlur={8}
          />
        )}
        <Circle
          x={radius}
          y={radius}
          radius={radius}
          fill={fill}
          stroke={selected ? COLORS.selected : COLORS.beltStroke}
          strokeWidth={1}
        />
        {isMp && mpId ? (
          <Text
            text={mpId}
            x={0}
            y={radius - 5}
            width={size.width}
            align="center"
            fontSize={Math.max(7, Math.min(11, radius * 0.7))}
            fontStyle="bold"
            fill={COLORS.mpText}
            listening={false}
          />
        ) : null}
      </>
    )
  }

  if (isEnvironmentKind(component.kind)) {
    if (component.kind === 'bin-source') {
      return <BinSourceShape size={size} binSource={binSource} remaining={binsRemaining} stroke={stroke} strokeWidth={strokeWidth} />
    }
    return <SinkShape size={size} stroke={stroke} strokeWidth={strokeWidth} />
  }

  // Transport belts render as an actual conveyor (track + rails + direction), with
  // a shape that reflects the kind (straight / incline / decline / merge / curve / U).
  // Chevrons only scroll for a belt that is in its Running state.
  const phase = component.transport?.state === 'Running' ? beltPhase : 0
  if (component.kind === 'merge') {
    return <MergeBelt size={size} stroke={stroke} strokeWidth={strokeWidth} phase={phase} />
  }
  if (component.kind === 'curved-belt' || component.kind === 'u-belt') {
    return <CurvedBelt component={component} units={units} stroke={stroke} strokeWidth={strokeWidth} />
  }
  return <StraightBelt component={component} size={size} stroke={stroke} strokeWidth={strokeWidth} phase={phase} />
}

/**
 * The Bin Source box: a tote glyph tinted with the pool's dominant bin colour and
 * stamped with the total number of bins it holds, plus a row of per-type colour
 * swatches when the pool mixes types. Replaces the generic environment label.
 */
function BinSourceShape({
  size,
  binSource,
  remaining,
  stroke,
  strokeWidth,
}: {
  size: { width: number; height: number }
  binSource: BinSource
  remaining: number
  stroke: string
  strokeWidth: number
}) {
  const glyphWidth = Math.min(30, size.width - 16)
  const glyphHeight = 20
  const glyphX = (size.width - glyphWidth) / 2
  const glyphY = 6

  const swatches = binSource.types.length > 1 ? binSource.types.slice(0, 5) : []
  const swatchWidth = 8
  const swatchGap = 3
  const swatchesWidth = swatches.length * swatchWidth + Math.max(0, swatches.length - 1) * swatchGap
  const swatchX0 = (size.width - swatchesWidth) / 2
  const swatchY = size.height - 9

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
      {/* Open-top rim of the tote — the template green, independent of bin-type colours. */}
      <Rect
        x={glyphX - 1}
        y={glyphY - 2}
        width={glyphWidth + 2}
        height={4}
        cornerRadius={2}
        fill={COLORS.binGlyphRim}
        stroke={COLORS.beltStroke}
        strokeWidth={1}
      />
      {/* Tote body in the template green — a fixed brand glyph, not tied to bin types. */}
      <Rect
        x={glyphX}
        y={glyphY}
        width={glyphWidth}
        height={glyphHeight}
        cornerRadius={[1, 1, 4, 4]}
        fill={COLORS.binGlyphFill}
        stroke={COLORS.beltStroke}
        strokeWidth={1}
      />
      {/* Bins still held in the pool — shrinks as bins are released during a run. */}
      <Text
        text={String(remaining)}
        x={glyphX}
        y={glyphY + glyphHeight / 2 - 5}
        width={glyphWidth}
        align="center"
        fontSize={11}
        fontStyle="bold"
        fill={COLORS.binGlyphText}
        listening={false}
      />
      {swatches.map((type, index) => (
        <Rect
          key={index}
          x={swatchX0 + index * (swatchWidth + swatchGap)}
          y={swatchY}
          width={swatchWidth}
          height={5}
          cornerRadius={1}
          fill={type.color}
          listening={false}
        />
      ))}
    </>
  )
}

/**
 * The Sink box: a radially-symmetric drain/funnel where transport units are
 * consumed. Concentric rings darken toward a central opening and four inward
 * chevrons read as "items drawn in and removed". Being symmetric, it looks correct
 * at any rotation — so it replaces the old "Sink" label that flipped when rotated.
 */
function SinkShape({
  size,
  stroke,
  strokeWidth,
}: {
  size: { width: number; height: number }
  stroke: string
  strokeWidth: number
}) {
  const cx = size.width / 2
  const cy = size.height / 2
  const r = Math.min(size.width, size.height) * 0.34
  // Base triangle sits north of centre pointing inward; rotate it to N/E/S/W.
  const arrows = [0, 90, 180, 270].map((deg) => {
    const rad = (deg * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const local = [
      { x: 0, y: -(r + 1) },
      { x: -4, y: -(r + 7) },
      { x: 4, y: -(r + 7) },
    ]
    return local.flatMap((point) => [
      cx + point.x * cos - point.y * sin,
      cy + point.x * sin + point.y * cos,
    ])
  })

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
      {/* Funnel walls: an outer ring that darkens toward a central opening. */}
      <Circle x={cx} y={cy} radius={r} fill={COLORS.beltFill} stroke={COLORS.sinkRim} strokeWidth={1.5} listening={false} />
      <Circle x={cx} y={cy} radius={r * 0.62} stroke={COLORS.sinkRim} strokeWidth={1} listening={false} />
      {/* The dark opening transport units fall into and are removed. */}
      <Circle x={cx} y={cy} radius={r * 0.3} fill={COLORS.sinkHole} listening={false} />
      {arrows.map((points, index) => (
        <Line key={index} points={points} closed fill={COLORS.chevron} opacity={0.55} listening={false} />
      ))}
    </>
  )
}

interface BeltShapeProps {
  component: Component
  size: { width: number; height: number }
  stroke: string
  strokeWidth: number
  phase: number
}

/**
 * Evenly-spaced travel chevrons that read as a moving belt surface. `phase` in
 * `[0, 1)` slides the chevrons one full `step` per cycle in the travel direction.
 */
function chevrons(
  width: number,
  height: number,
  direction: Direction | undefined,
  phase = 0,
): number[][] {
  const cy = height / 2
  const arm = Math.min(6, height * 0.3)
  const half = Math.max(2, height * 0.22)
  const step = 14
  const pointsLeft = direction === 'west'
  const dir = pointsLeft ? -1 : 1
  const offset = (((dir * phase * step) % step) + step) % step
  const shapes: number[][] = []
  for (let base = -step; base <= width + step; base += step) {
    const x = base + offset
    if (x < 2 || x > width - arm) continue
    shapes.push(
      pointsLeft
        ? [x + arm, cy - half, x, cy, x + arm, cy + half]
        : [x, cy - half, x + arm, cy, x, cy + half],
    )
  }
  return shapes
}

/** A straight (or incline / decline) belt: track, side rails, and travel chevrons. */
function StraightBelt({ component, size, stroke, strokeWidth, phase }: BeltShapeProps) {
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
      {chevrons(width, height, component.geometry.direction, phase).map((points, index) => (
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
  phase,
}: {
  size: { width: number; height: number }
  stroke: string
  strokeWidth: number
  phase: number
}) {
  const { width, height } = size
  const laneT = height / 2 // each lane is the uniform belt width (height = 2 lanes)
  const cy = height / 2
  const junctionX = width * 0.45
  const outTop = cy - laneT / 2
  const outBot = cy + laneT / 2

  const upperInput = [0, 0, junctionX, outTop, junctionX, outBot, 0, laneT]
  const lowerInput = [0, laneT, junctionX, outTop, junctionX, outBot, 0, height]

  // Chevrons scroll along the output lane (junctionX → width) to convey travel.
  const step = 14
  const arm = 5
  const offset = ((phase * step) % step + step) % step
  const outletChevrons: number[] = []
  for (let base = junctionX; base <= width; base += step) {
    const x = base + offset
    if (x < junctionX + 2 || x > width - arm) continue
    outletChevrons.push(x)
  }

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
      {outletChevrons.map((x, index) => (
        <Line
          key={index}
          points={[x, cy - laneT * 0.28, x + arm, cy, x, cy + laneT * 0.28]}
          stroke={COLORS.chevron}
          strokeWidth={1.5}
        />
      ))}
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ComponentPalette } from './ComponentPalette'
import { PropertyInspector } from './PropertyInspector'
import { SimulationControls } from './SimulationControls'
import { SimulationStage } from './SimulationStage'
import { useCanvasLayout } from './useCanvasLayout'
import { createSimulationClient } from './simulationClientFactory'
import { orderedMpIdsAlongRoute } from './layout'
import type { SimulationClient } from './simulationClient'
import type { CanvasLayout } from './types'
import { Icon } from '@/components/ui/Icon'

interface CanvasPageProps {
  /** Optional seed layout (tests inject a deterministic one; the app omits it). */
  seed?: CanvasLayout
  /** Injectable MP/TO client for tests; defaults to the passive or live client (factory). */
  client?: SimulationClient
}

/** Reads a picked file's text, preferring `Blob.text()` and falling back to `FileReader`. */
function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'))
    reader.readAsText(file)
  })
}

/**
 * The Conveyor Simulation Canvas screen: palette → Konva stage → property
 * inspector, with a transient preview clock and JSON export/import. The layout is
 * design-time config (ADR-0013); runtime authority stays with the backend (ADR-0012).
 */
export function CanvasPage({ seed, client }: CanvasPageProps) {
  // A configured backend is authoritative: the live client provides real transport
  // orders and the demo toggle is disabled. With no backend, default the demo
  // resolver ON so a frontend-only user still sees the full MP→TO→next-MP cycle.
  const backendConfigured = useMemo(
    () => Boolean(import.meta.env.VITE_API_BASE_URL?.trim()),
    [],
  )
  const [demoResponses, setDemoResponses] = useState(() => !backendConfigured)

  // The demo next-MP resolver reads the latest route ordering through a ref, so the
  // client identity stays stable as the layout is edited — only toggling demo mode
  // (or an injected client) recreates the client.
  const mpOrderRef = useRef<readonly string[]>([])
  const nextMessagePoint = useCallback((messagePointId: string): string | undefined => {
    const order = mpOrderRef.current
    const index = order.indexOf(messagePointId)
    // Advance to the next MP along the route; undefined at the last MP (the bin holds).
    return index === -1 ? undefined : order[index + 1]
  }, [])

  // A fresh client per demo-toggle so switching demo/disconnected swaps cleanly and
  // resets the demo telegram-id sequence; an injected client (tests) always wins.
  const resolvedClient = useMemo(
    () => client ?? createSimulationClient({ demo: demoResponses, nextMessagePoint }),
    [client, demoResponses, nextMessagePoint],
  )
  const canvas = useCanvasLayout(seed, resolvedClient)
  const {
    layout,
    components,
    connections,
    units,
    binSource,
    binCount,
    binsRemaining,
    bins,
    triggered,
    awaitingTo,
    selectedId,
    selectedIds,
    selectedComponent,
    draft,
    isDirty,
    status,
    speed,
    addComponent,
    removeComponent,
    removeSelected,
    snapComponent,
    addBinType,
    updateBinType,
    removeBinType,
    updateBinSpacing,
    selectNode,
    selectNodes,
    clearSelection,
    updateDraft,
    applyDraft,
    revertDraft,
    exportLayout,
    saveLayout,
    hasUnsavedChanges,
    importLayout,
    play,
    pause,
    stop,
    setSpeed,
    tick,
  } = canvas

  const [exportedJson, setExportedJson] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Render the in-progress draft for the selected component so property edits
  // (size, width/length, orientation) preview live on the canvas before Apply.
  const displayComponents = useMemo(
    () =>
      draft && selectedId
        ? components.map((component) => (component.id === selectedId ? draft : component))
        : components,
    [components, draft, selectedId],
  )

  // Keep the demo resolver's view of the MP ordering current as the layout is edited,
  // so simulated transport orders route bins to the next MP along the built route.
  useEffect(() => {
    mpOrderRef.current = orderedMpIdsAlongRoute(layout)
  }, [layout])

  // Drive the transient preview clock while running (guarded for jsdom/tests).
  useEffect(() => {
    if (status !== 'running' || typeof requestAnimationFrame === 'undefined') return
    let frame = 0
    let last = performance.now()
    const loop = (now: number) => {
      tick(now - last)
      last = now
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [status, tick])

  // Clear the transient "Saved" confirmation shortly after a save.
  useEffect(() => {
    if (!justSaved) return
    const timer = setTimeout(() => setJustSaved(false), 1800)
    return () => clearTimeout(timer)
  }, [justSaved])

  // Delete / Backspace removes the current selection (marquee or single). Ignored
  // while typing in a form field so text editing (MP id, numbers) isn't hijacked.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      ) {
        return
      }
      if (selectedIds.size === 0) return
      event.preventDefault()
      removeSelected()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIds, removeSelected])

  const handleSave = () => {
    if (saveLayout()) setJustSaved(true)
  }

  const handleExport = () => {
    const json = exportLayout()
    setExportedJson(json)
    try {
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'canvas-layout.json'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch {
      // Download unavailable (e.g. jsdom) — the textarea still exposes the JSON.
    }
  }

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = '' // allow re-importing the same file
    if (!file) return
    try {
      const text = await readFileText(file)
      const result = importLayout(text)
      setImportError(result.ok ? null : (result.errors?.join(' ') ?? 'Invalid layout.'))
    } catch {
      setImportError('Could not read the selected file.')
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface">Conveyor Simulation Canvas</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Design-time layout · runtime motion is a local preview only
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            aria-label="Save layout"
            title={
              hasUnsavedChanges && !justSaved
                ? 'You have unsaved changes — click to apply them'
                : 'Save layout'
            }
            className={`flex items-center gap-2 rounded border px-3 py-2 font-label-xs text-label-xs uppercase transition-colors ${
              hasUnsavedChanges && !justSaved
                ? 'save-blink border-primary text-primary hover:bg-primary/10'
                : 'border-outline-variant text-on-surface hover:bg-surface-variant'
            }`}
          >
            <Icon name={justSaved ? 'check' : 'save'} className="text-[16px]" />
            {justSaved ? 'Saved' : hasUnsavedChanges ? 'Save layout *' : 'Save layout'}
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-2 rounded border border-outline-variant px-3 py-2 font-label-xs text-label-xs uppercase text-on-surface transition-colors hover:bg-surface-variant"
          >
            <Icon name="download" className="text-[16px]" />
            Export layout
          </button>
          <label className="flex cursor-pointer items-center gap-2 rounded border border-outline-variant px-3 py-2 font-label-xs text-label-xs uppercase text-on-surface transition-colors hover:bg-surface-variant">
            <Icon name="upload" className="text-[16px]" />
            Import layout
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              aria-label="Import layout"
              onChange={handleImportFile}
              className="sr-only"
            />
          </label>
        </div>
      </header>

      {importError ? (
        <p role="alert" className="rounded border border-error/40 bg-error-container/20 px-3 py-2 font-body-sm text-body-sm text-error">
          {importError}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-3">
        <ComponentPalette onAdd={addComponent} />

        <div className="relative flex min-h-0 flex-1">
          <SimulationStage
            components={displayComponents}
            connections={connections}
            units={units}
            binSource={binSource}
            binsRemaining={binsRemaining}
            bins={bins}
            triggered={triggered}
            awaitingTo={awaitingTo}
            animated={status === 'running'}
            selectedId={selectedId}
            selectedIds={selectedIds}
            onSelectNode={selectNode}
            onMarqueeSelect={selectNodes}
            onSnapNode={snapComponent}
            onDeleteNode={removeComponent}
            onDropComponent={addComponent}
            onBackgroundClick={clearSelection}
          />
          <SimulationControls
            status={status}
            speed={speed}
            canStart={binCount > 0}
            onPlay={play}
            onPause={pause}
            onStop={stop}
            onSpeedChange={setSpeed}
            demoResponses={demoResponses}
            onDemoResponsesChange={setDemoResponses}
            demoDisabled={backendConfigured || status !== 'idle'}
          />
        </div>

        <PropertyInspector
          component={selectedComponent}
          draft={draft}
          isDirty={isDirty}
          binSource={binSource}
          onChange={updateDraft}
          onApply={applyDraft}
          onRevert={revertDraft}
          onDelete={removeComponent}
          onClose={clearSelection}
          onAddBinType={addBinType}
          onUpdateBinType={updateBinType}
          onRemoveBinType={removeBinType}
          onUpdateBinSpacing={updateBinSpacing}
        />
      </div>

      {exportedJson ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="font-label-xs text-label-xs uppercase text-on-surface-variant">
              Exported layout JSON
            </span>
            <button
              type="button"
              onClick={() => setExportedJson(null)}
              aria-label="Close exported layout"
              className="flex items-center gap-1 rounded px-2 py-1 font-label-xs text-label-xs uppercase text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-on-surface"
            >
              <Icon name="close" className="text-[16px]" />
              Close
            </button>
          </div>
          <textarea
            aria-label="Exported layout JSON"
            readOnly
            value={exportedJson}
            rows={4}
            spellCheck={false}
            className="w-full rounded border border-outline-variant bg-surface-container p-2 font-data-mono text-[11px] text-on-surface"
          />
        </div>
      ) : null}
    </div>
  )
}

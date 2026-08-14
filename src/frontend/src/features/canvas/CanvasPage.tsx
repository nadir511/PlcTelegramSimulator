import { useEffect, useMemo, useRef, useState } from 'react'
import { ComponentPalette } from './ComponentPalette'
import { PropertyInspector } from './PropertyInspector'
import { SimulationControls } from './SimulationControls'
import { SimulationStage } from './SimulationStage'
import { useCanvasLayout } from './useCanvasLayout'
import { createSimulationClient } from './simulationClientFactory'
import type { SimulationClient } from './simulationClient'
import type { CanvasLayout } from './types'
import { Icon } from '@/components/ui/Icon'

interface CanvasPageProps {
  /** Optional seed layout (tests inject a deterministic one; the app omits it). */
  seed?: CanvasLayout
  /** Injectable MP/TO client for tests; defaults to the mock or live client (factory). */
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
  const resolvedClient = useMemo(() => client ?? createSimulationClient(), [client])
  const canvas = useCanvasLayout(seed, resolvedClient)
  const {
    components,
    connections,
    units,
    bins,
    triggered,
    awaitingTo,
    selectedId,
    selectedComponent,
    draft,
    isDirty,
    status,
    speed,
    addComponent,
    removeComponent,
    addConnection,
    removeConnection,
    moveComponent,
    selectNode,
    clearSelection,
    updateDraft,
    applyDraft,
    revertDraft,
    exportLayout,
    importLayout,
    play,
    pause,
    stop,
    setSpeed,
    spawnBin,
    tick,
  } = canvas

  const [exportedJson, setExportedJson] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
            components={components}
            connections={connections}
            units={units}
            bins={bins}
            triggered={triggered}
            awaitingTo={awaitingTo}
            selectedId={selectedId}
            onSelectNode={selectNode}
            onMoveNode={moveComponent}
            onDeleteNode={removeComponent}
            onDropComponent={addComponent}
            onConnect={addConnection}
            onDeleteConnection={removeConnection}
            onBackgroundClick={clearSelection}
          />
          <SimulationControls
            status={status}
            speed={speed}
            onPlay={play}
            onPause={pause}
            onStop={stop}
            onSpeedChange={setSpeed}
            onSpawnBin={spawnBin}
          />
        </div>

        <PropertyInspector
          component={selectedComponent}
          draft={draft}
          isDirty={isDirty}
          onChange={updateDraft}
          onApply={applyDraft}
          onRevert={revertDraft}
          onDelete={removeComponent}
          onClose={clearSelection}
        />
      </div>

      {exportedJson ? (
        <label className="flex flex-col gap-1">
          <span className="font-label-xs text-label-xs uppercase text-on-surface-variant">
            Exported layout JSON
          </span>
          <textarea
            aria-label="Exported layout JSON"
            readOnly
            value={exportedJson}
            rows={4}
            spellCheck={false}
            className="w-full rounded border border-outline-variant bg-surface-container p-2 font-data-mono text-[11px] text-on-surface"
          />
        </label>
      ) : null}
    </div>
  )
}

import { PALETTE_GROUPS } from './defaults'
import { CANVAS_DND_MIME } from './layout'
import type { ComponentKind } from './types'
import { Icon } from '@/components/ui/Icon'

interface ComponentPaletteProps {
  /** Add a component of the clicked kind to the layout (accessible fallback for drag). */
  onAdd: (kind: ComponentKind) => void
}

/**
 * The left component palette (ADR-0013 taxonomy): grouped tiles. Each tile is
 * **draggable** onto the canvas (drops at the cursor), and is also a `<button>` so
 * clicking (or keyboard activation) adds it — keeping the palette accessible.
 */
export function ComponentPalette({ onAdd }: ComponentPaletteProps) {
  const handleDragStart = (kind: ComponentKind) => (event: React.DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.setData(CANVAS_DND_MIME, kind)
    event.dataTransfer.setData('text/plain', kind)
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <aside
      aria-label="Component palette"
      className="flex w-64 shrink-0 flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-container-low"
    >
      <div className="border-b border-outline-variant bg-surface-container-high p-3">
        <h2 className="font-label-xs text-label-xs uppercase tracking-wider text-on-surface-variant">
          Components
        </h2>
        <p className="mt-1 font-body-sm text-[10px] text-on-surface-variant/70">
          Drag onto the canvas, or click to add
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {PALETTE_GROUPS.map((group) => (
          <section key={group.title} className="mb-4 last:mb-0">
            <h3 className="mb-2 px-1 font-label-xs text-[10px] uppercase tracking-wider text-on-surface-variant/70">
              {group.title}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {group.items.map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  draggable
                  onDragStart={handleDragStart(item.kind)}
                  onClick={() => onAdd(item.kind)}
                  aria-label={`Add ${item.label}`}
                  className="flex cursor-grab flex-col items-center justify-center gap-2 rounded border border-outline-variant bg-surface-container p-3 transition-colors hover:border-secondary focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary active:cursor-grabbing"
                >
                  <Icon name={item.icon} className="text-secondary" />
                  <span className="text-center font-label-xs text-[10px] text-on-surface">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  )
}

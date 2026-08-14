/** Top application bar: product identity only. */
export function TopBar() {
  return (
    <header className="w-full flex justify-between items-center px-gutter h-14 bg-surface-container-low border-b border-outline-variant z-10 shrink-0">
      <div className="flex items-center gap-3">
        <span className="font-headline-md text-headline-md tracking-tight text-on-surface">
          PLC SIMULATOR
        </span>
        <span className="font-label-xs text-label-xs text-on-surface-variant border border-outline-variant px-1.5 py-0.5 rounded">
          SIM-PLC v2.4
        </span>
      </div>
    </header>
  )
}

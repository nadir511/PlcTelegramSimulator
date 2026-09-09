import type { ReactNode } from 'react'
import { SideNav } from './SideNav'
import { TopBar } from './TopBar'

interface AppShellProps {
  activeNavId: string
  /** Ids of the nav items that are implemented and clickable. */
  enabledNavIds?: readonly string[]
  onNavigate?: (id: string) => void
  /** Optional top-bar actions (e.g. config Export/Import). */
  topBarActions?: ReactNode
  children: ReactNode
}

/** Fixed side-nav + top-bar frame that hosts each screen. */
export function AppShell({
  activeNavId,
  enabledNavIds,
  onNavigate,
  topBarActions,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-on-background font-body-md">
      <SideNav activeId={activeNavId} enabledIds={enabledNavIds} onNavigate={onNavigate} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar actions={topBarActions} />
        <main className="flex-1 grid-bg p-container-padding flex flex-col gap-4 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

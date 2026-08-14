import type { ReactNode } from 'react'
import { SideNav } from './SideNav'
import { TopBar } from './TopBar'

interface AppShellProps {
  activeNavId: string
  /** Ids of the nav items that are implemented and clickable. */
  enabledNavIds?: readonly string[]
  onNavigate?: (id: string) => void
  children: ReactNode
}

/** Fixed side-nav + top-bar frame that hosts each screen. */
export function AppShell({ activeNavId, enabledNavIds, onNavigate, children }: AppShellProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-on-background font-body-md">
      <SideNav activeId={activeNavId} enabledIds={enabledNavIds} onNavigate={onNavigate} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 grid-bg p-container-padding flex flex-col gap-4 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

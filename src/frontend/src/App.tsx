import { useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { CanvasPage } from '@/features/canvas/CanvasPage'
import { ConnectionPage } from '@/features/connection/ConnectionPage'
import { TelegramsPage } from '@/features/telegrams/TelegramsPage'

/** Screens reachable from the side navigation. */
type View = 'connection' | 'telegrams' | 'canvas'

export default function App() {
  const [view, setView] = useState<View>('connection')

  return (
    <AppShell
      activeNavId={view}
      enabledNavIds={['connection', 'telegrams', 'canvas']}
      onNavigate={(id) => setView(id as View)}
    >
      {view === 'canvas' ? (
        <CanvasPage />
      ) : view === 'telegrams' ? (
        <TelegramsPage />
      ) : (
        <ConnectionPage />
      )}
    </AppShell>
  )
}

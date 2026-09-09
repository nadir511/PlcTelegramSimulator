import { useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { ConfigProfileBar } from '@/config/ConfigProfileBar'
import { CanvasPage } from '@/features/canvas/CanvasPage'
import { ConnectionPage } from '@/features/connection/ConnectionPage'
import { TelegramsPage } from '@/features/telegrams/TelegramsPage'

/** Screens reachable from the side navigation. */
type View = 'connection' | 'telegrams' | 'canvas'

export default function App() {
  const [view, setView] = useState<View>('connection')
  // Bumped after a config import so the active connection/telegram page remounts
  // and re-hydrates from the freshly written stores. The canvas is excluded (its
  // layout is a separate file, ADR-0013) so importing never resets canvas state.
  const [configEpoch, setConfigEpoch] = useState(0)

  return (
    <AppShell
      activeNavId={view}
      enabledNavIds={['connection', 'telegrams', 'canvas']}
      onNavigate={(id) => setView(id as View)}
      topBarActions={<ConfigProfileBar onImported={() => setConfigEpoch((epoch) => epoch + 1)} />}
    >
      <div key={view === 'canvas' ? 'canvas' : configEpoch} className="contents">
        {view === 'canvas' ? (
          <CanvasPage />
        ) : view === 'telegrams' ? (
          <TelegramsPage />
        ) : (
          <ConnectionPage />
        )}
      </div>
    </AppShell>
  )
}

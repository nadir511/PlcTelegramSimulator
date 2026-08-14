import { useMemo, useState } from 'react'
import { ConfigPanel } from './ConfigPanel'
import type { ConnectionClient } from './connectionClient'
import { createConnectionClient } from './clientFactory'
import { DEFAULT_CONFIG } from './defaults'
import { LiveTrafficPanel } from './LiveTrafficPanel'
import { SendTelegramPanel } from './SendTelegramPanel'
import { SessionStatusPanel } from './SessionStatusPanel'
import type { ListenerConfig } from './types'
import { useConnection } from './useConnection'
import { validateConfig } from './format'

interface ConnectionPageProps {
  /** Injectable for tests; defaults to the mock or live client (see clientFactory). */
  client?: ConnectionClient
}

const RUNNING = new Set(['starting', 'listening', 'connected'])

/** Connection & Session Management screen. */
export function ConnectionPage({ client }: ConnectionPageProps) {
  const resolvedClient = useMemo(() => client ?? createConnectionClient(), [client])
  const { status, error, entries, start, stop, send, clear } = useConnection(resolvedClient)

  const [config, setConfig] = useState<ListenerConfig>(DEFAULT_CONFIG)

  const errors = useMemo(() => validateConfig(config), [config])
  const isValid = Object.keys(errors).length === 0
  const isRunning = RUNNING.has(status)

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <ConfigPanel config={config} errors={errors} disabled={isRunning} onChange={setConfig} />
        <SessionStatusPanel
          status={status}
          error={error}
          entries={entries}
          canStart={isValid}
          onStart={() => start(config)}
          onStop={stop}
        />
        <SendTelegramPanel connected={status === 'connected'} onSend={send} />
      </div>
      <LiveTrafficPanel entries={entries} onClear={clear} />
    </>
  )
}

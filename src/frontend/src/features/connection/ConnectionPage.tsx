import { useEffect, useMemo, useState } from 'react'
import { ConfigPanel } from './ConfigPanel'
import type { ConnectionClient } from './connectionClient'
import { createConnectionClient } from './clientFactory'
import { DEFAULT_CONFIG } from './defaults'
import { LiveTrafficPanel } from './LiveTrafficPanel'
import { loadStoredConnection, persistConnection } from './persistence'
import { SendTelegramPanel } from './SendTelegramPanel'
import { SessionStatusPanel } from './SessionStatusPanel'
import type { ListenerConfig } from './types'
import { useConnection } from './useConnection'
import { validateConfig } from './format'
import { DEFAULT_END_OF_TELEGRAM } from '../telegrams/defaults'
import { loadStoredTelegrams } from '../telegrams/persistence'

interface ConnectionPageProps {
  /** Injectable for tests; defaults to the mock or live client (see clientFactory). */
  client?: ConnectionClient
}

const RUNNING = new Set(['starting', 'listening', 'connected'])

/**
 * Current registry-wide End-of-Telegram terminator (freshly read from storage).
 * An empty or absent value falls back to the default terminator: EOF framing needs a
 * delimiter, so the backend always receives a non-empty terminator on connect.
 */
const currentEndOfTelegram = (): string => {
  const stored = loadStoredTelegrams()?.endOfTelegram
  return stored && stored.length > 0 ? stored : DEFAULT_END_OF_TELEGRAM
}

/** Connection & Session Management screen. */
export function ConnectionPage({ client }: ConnectionPageProps) {
  const resolvedClient = useMemo(() => client ?? createConnectionClient(), [client])
  const { status, error, entries, start, stop, send, clear } = useConnection(resolvedClient)

  const [config, setConfig] = useState<ListenerConfig>(() => loadStoredConnection() ?? DEFAULT_CONFIG)
  // The terminator is owned by the telegram type registry; snapshot it on mount and
  // refresh it on each connect so the wire value and the panel note stay in step.
  const [endOfTelegram, setEndOfTelegram] = useState<string>(currentEndOfTelegram)

  useEffect(() => {
    persistConnection(config)
  }, [config])

  const errors = useMemo(() => validateConfig(config), [config])
  const isValid = Object.keys(errors).length === 0
  const isRunning = RUNNING.has(status)

  const handleStart = (): void => {
    const eot = currentEndOfTelegram()
    setEndOfTelegram(eot)
    start(config, eot)
  }

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <ConfigPanel config={config} errors={errors} disabled={isRunning} onChange={setConfig} />
        <SessionStatusPanel
          status={status}
          error={error}
          entries={entries}
          canStart={isValid}
          onStart={handleStart}
          onStop={stop}
        />
        <SendTelegramPanel connected={status === 'connected'} endOfTelegram={endOfTelegram} onSend={send} />
      </div>
      <LiveTrafficPanel entries={entries} onClear={clear} />
    </>
  )
}

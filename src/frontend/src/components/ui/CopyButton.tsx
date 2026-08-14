import { useState } from 'react'
import { Icon } from './Icon'

interface CopyButtonProps {
  /** Text placed on the clipboard when the button is pressed. */
  value: string
  /** Accessible label describing what is copied, e.g. "Copy raw stream". */
  label: string
  className?: string
}

/** Icon button that copies {@link value} to the clipboard and briefly confirms. */
export function CopyButton({ value, label, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    if (!navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={value === ''}
      aria-label={label}
      title={copied ? 'Copied' : label}
      className={`rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ''}`.trim()}
    >
      <Icon
        name={copied ? 'check' : 'content_copy'}
        className={`text-[16px] ${copied ? 'text-secondary' : ''}`.trim()}
      />
    </button>
  )
}

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CopyButton } from './CopyButton'

describe('CopyButton', () => {
  it('writes its value to the clipboard when pressed', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    render(<CopyButton value="4D 50" label="Copy raw stream" />)
    fireEvent.click(screen.getByRole('button', { name: /copy raw stream/i }))

    expect(writeText).toHaveBeenCalledWith('4D 50')
    // Confirms with a check icon once the copy resolves.
    expect(await screen.findByText('check')).toBeInTheDocument()
  })

  it('is disabled when there is nothing to copy', () => {
    render(<CopyButton value="" label="Copy raw stream" />)
    expect(screen.getByRole('button', { name: /copy raw stream/i })).toBeDisabled()
  })
})

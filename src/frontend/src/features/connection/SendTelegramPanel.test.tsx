import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SendTelegramPanel } from './SendTelegramPanel'

describe('SendTelegramPanel', () => {
  it('disables send while disconnected', () => {
    render(<SendTelegramPanel connected={false} onSend={vi.fn()} />)
    expect(screen.getByRole('button', { name: /^send$/i })).toBeDisabled()
    expect(screen.getByText(/connect a client to send/i)).toBeInTheDocument()
  })

  it('defaults to ASCII input mode', () => {
    render(<SendTelegramPanel connected onSend={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'ASCII' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Hex' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/payload \(ascii text\)/i)).toBeInTheDocument()
  })

  it('sends parsed ASCII bytes by default', () => {
    const onSend = vi.fn()
    render(<SendTelegramPanel connected onSend={onSend} />)
    fireEvent.change(screen.getByLabelText(/payload/i), { target: { value: 'MP01' } })
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }))
    expect(onSend).toHaveBeenCalledWith([0x4d, 0x50, 0x30, 0x31])
  })

  it('sends parsed hex bytes when connected', () => {
    const onSend = vi.fn()
    render(<SendTelegramPanel connected onSend={onSend} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hex' }))
    fireEvent.change(screen.getByLabelText(/payload/i), { target: { value: '02 4D 03' } })
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }))
    expect(onSend).toHaveBeenCalledWith([0x02, 0x4d, 0x03])
  })

  it('keeps the payload in the input after sending', () => {
    const onSend = vi.fn()
    render(<SendTelegramPanel connected onSend={onSend} />)
    const input = screen.getByLabelText<HTMLTextAreaElement>(/payload/i)
    fireEvent.change(input, { target: { value: 'MP01' } })
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }))
    expect(onSend).toHaveBeenCalledWith([0x4d, 0x50, 0x30, 0x31])
    expect(input.value).toBe('MP01')
  })

  it('notes that the configured End-of-Telegram is appended automatically', () => {
    render(<SendTelegramPanel connected endOfTelegram="#" onSend={vi.fn()} />)
    expect(
      screen.getByText(/end-of-telegram .#. is appended automatically/i),
    ).toBeInTheDocument()
  })

  it('renders no terminator note when End-of-Telegram is empty', () => {
    render(<SendTelegramPanel connected endOfTelegram="" onSend={vi.fn()} />)
    expect(screen.queryByText(/is appended automatically/i)).not.toBeInTheDocument()
  })

  it('flags invalid hex and blocks sending', () => {
    const onSend = vi.fn()
    render(<SendTelegramPanel connected onSend={onSend} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hex' }))
    fireEvent.change(screen.getByLabelText(/payload/i), { target: { value: 'ZZ' } })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^send$/i })).toBeDisabled()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('converts the payload between hex and ASCII on toggle', () => {
    render(<SendTelegramPanel connected onSend={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hex' }))
    fireEvent.change(screen.getByLabelText(/payload/i), { target: { value: '48 49' } })

    fireEvent.click(screen.getByRole('button', { name: 'ASCII' }))
    expect(screen.getByLabelText<HTMLTextAreaElement>(/payload/i).value).toBe('HI')

    fireEvent.click(screen.getByRole('button', { name: 'Hex' }))
    expect(screen.getByLabelText<HTMLTextAreaElement>(/payload/i).value).toBe('48 49')
  })
})

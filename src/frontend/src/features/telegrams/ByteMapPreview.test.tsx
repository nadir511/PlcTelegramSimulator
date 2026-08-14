import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ByteMapPreview } from './ByteMapPreview'
import type { TelegramField } from './types'

const field = (overrides: Partial<TelegramField> = {}): TelegramField => ({
  id: overrides.id ?? 'f1',
  name: overrides.name ?? 'Field',
  dataType: overrides.dataType ?? 'STRING',
  length: overrides.length ?? 1,
  defaultValue: overrides.defaultValue ?? '',
  auto: overrides.auto,
})

describe('ByteMapPreview', () => {
  it('renders one box per byte, showing each byte as its ASCII character', () => {
    render(<ByteMapPreview fields={[field({ name: 'Sender', length: 2, defaultValue: 'CV' })]} />)
    const group = screen.getByRole('group', { name: /Sender bytes/i })
    expect(group.children).toHaveLength(2)
    expect(group).toHaveTextContent('CV')
  })

  it('scales the box count with the field length (length 4 → 4 boxes)', () => {
    render(<ByteMapPreview fields={[field({ name: 'Barcode', length: 4, defaultValue: 'AB' })]} />)
    const group = screen.getByRole('group', { name: /Barcode bytes/i })
    expect(group.children).toHaveLength(4)
    // 'AB' is printable; the padding bytes are non-printable dots.
    expect(group).toHaveTextContent('AB..')
  })

  it('gives each field its own labelled byte group so neighbours stay distinct', () => {
    render(
      <ByteMapPreview
        fields={[
          field({ id: 'a', name: 'Sender', length: 2, defaultValue: 'CV' }),
          field({ id: 'b', name: 'Receiver', length: 2, defaultValue: '01' }),
        ]}
      />,
    )
    expect(screen.getByRole('group', { name: /Sender bytes/i })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /Receiver bytes/i })).toBeInTheDocument()
  })

  it('renders computed (auto) fields as unknown (dot) bytes', () => {
    render(<ByteMapPreview fields={[field({ name: 'Checksum', length: 2, auto: true })]} />)
    const group = screen.getByRole('group', { name: /Checksum bytes/i })
    expect(group.children).toHaveLength(2)
    expect(group).toHaveTextContent('..')
  })

  it('appends the End-of-Telegram terminator as its own byte group', () => {
    render(
      <ByteMapPreview
        fields={[field({ name: 'Sender', length: 2, defaultValue: 'CV' })]}
        endOfTelegram="#"
      />,
    )
    const eot = screen.getByRole('group', { name: /End of Telegram bytes/i })
    expect(eot.children).toHaveLength(1)
    expect(eot).toHaveTextContent('#')
    // The terminator is part of the byte form: it shows in both streams.
    expect(screen.getByLabelText('Raw stream output')).toHaveTextContent('43 56 23')
    expect(screen.getByLabelText('ASCII stream output')).toHaveTextContent('CV#')
  })

  it('omits the terminator group when no End-of-Telegram is set', () => {
    render(
      <ByteMapPreview fields={[field({ name: 'Sender', length: 2, defaultValue: 'CV' })]} />,
    )
    expect(screen.queryByRole('group', { name: /End of Telegram bytes/i })).not.toBeInTheDocument()
  })

  it('shows the ASCII string above the raw hex stream, each with a copy action', () => {
    render(
      <ByteMapPreview
        fields={[
          field({ id: 'a', name: 'Sender', length: 2, defaultValue: 'CV' }),
          field({ id: 'b', name: 'TelegramId', dataType: 'INT', length: 2, defaultValue: '1' }),
        ]}
      />,
    )
    const ascii = screen.getByLabelText('ASCII stream output')
    const raw = screen.getByLabelText('Raw stream output')
    // 'CV' stays printable; the INT bytes (00 01) are non-printable -> dots.
    expect(ascii).toHaveTextContent('CV..')
    expect(raw).toHaveTextContent('43 56 00 01')
    // ASCII precedes the raw stream in document order.
    expect(ascii.compareDocumentPosition(raw) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(screen.getByRole('button', { name: /copy ascii string/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /copy raw stream/i })).toBeEnabled()
  })
})

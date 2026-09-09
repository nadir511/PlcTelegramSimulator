import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TelegramsPage } from './TelegramsPage'

/** Field rows are those carrying a `Field NN name` input (not group/placeholder rows). */
function fieldRows(): HTMLElement[] {
  return within(screen.getByRole('table'))
    .getAllByRole('row')
    .filter((row) => within(row).queryByLabelText(/^Field \d+ name$/))
}

// The registry persists to localStorage, so isolate each test from the last.
beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('TelegramsPage', () => {
  it('lists the seeded telegram types with a delete action each', () => {
    render(<TelegramsPage />)
    const registry = screen.getByRole('group', { name: /telegram types/i })
    const seeded: Array<[string, string]> = [
      ['MP', 'Message Point'],
      ['SL', 'System Left'],
      ['SE', 'System Enter'],
      ['PD', 'PD Data'],
      ['FL', 'Fill Level'],
    ]
    for (const [code, name] of seeded) {
      expect(within(registry).getByRole('button', { name: new RegExp(name, 'i') })).toBeInTheDocument()
      expect(
        within(registry).getByRole('button', { name: new RegExp(`Delete ${code} telegram type`, 'i') }),
      ).toBeInTheDocument()
    }
  })

  it('shows each telegram type total field length on its chip', () => {
    render(<TelegramsPage />)
    const registry = screen.getByRole('group', { name: /telegram types/i })
    // Every seeded type carries the 12-byte common header (6 fields x 2 bytes).
    expect(within(registry).getAllByText('12 B')).toHaveLength(5)
  })

  it('updates a type chip total when a saved edit changes its field lengths', () => {
    render(<TelegramsPage />)
    const registry = () => screen.getByRole('group', { name: /telegram types/i })
    expect(within(registry()).getAllByText('12 B')).toHaveLength(5)

    // Widen the MP Sender field 2 -> 6 and save: the MP header becomes 16 bytes.
    fireEvent.change(screen.getByLabelText('Field 00 length'), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: /save structure/i }))

    expect(within(registry()).getByText('16 B')).toBeInTheDocument()
    expect(within(registry()).getAllByText('12 B')).toHaveLength(4)
  })

  it('shows the selected type structure and its derived total length', () => {
    render(<TelegramsPage />)
    expect(screen.getByRole('heading', { name: /Message Builder: MP/ })).toBeInTheDocument()
    expect(screen.getByDisplayValue('DefaultTelegramHeader')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Sender')).toBeInTheDocument()
    expect(screen.getByText('Total Length: 13 Bytes')).toBeInTheDocument()
  })

  it('seeds the common header with its default field values', () => {
    render(<TelegramsPage />)
    expect(screen.getByLabelText('Sender default value')).toHaveValue('CV')
    expect(screen.getByLabelText('Receiver default value')).toHaveValue('01')
    expect(screen.getByLabelText('TelegramId default value')).toHaveValue('1')
    expect(screen.getByLabelText('Status default value')).toHaveValue('N')
    // The raw stream reflects the encoded MP header defaults, in field order.
    expect(screen.getByLabelText('Raw stream output').textContent).toContain(
      '43 56 30 31 00 01 4E 00 4D 50 00 00',
    )
    // The ASCII string shows printable bytes as characters, the rest as dots.
    expect(screen.getByLabelText('ASCII stream output')).toHaveTextContent('CV01..N.MP..')
  })

  it('distinguishes each telegram type by its TelegramType discriminator', () => {
    render(<TelegramsPage />)
    // Every type shares the common header; the TelegramType default is the code.
    expect(screen.getByLabelText('TelegramType default value')).toHaveValue('MP')

    fireEvent.click(screen.getByRole('button', { name: /Fill Level/i }))
    expect(screen.getByRole('heading', { name: /Message Builder: FL/ })).toBeInTheDocument()
    expect(screen.getByLabelText('TelegramType default value')).toHaveValue('FL')
    expect(screen.getByText('Total Length: 13 Bytes')).toBeInTheDocument()
  })

  it('adds a new telegram type seeded with the default header group', () => {
    render(<TelegramsPage />)
    fireEvent.click(screen.getByRole('button', { name: /add type/i }))

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'sr' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sensor Reset' } })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    expect(screen.getByRole('heading', { name: /Message Builder: SR/ })).toBeInTheDocument()
    expect(screen.getByDisplayValue('DefaultTelegramHeader')).toBeInTheDocument()
    expect(screen.getByLabelText('TelegramType default value')).toHaveValue('SR')
    expect(screen.getByText('Total Length: 13 Bytes')).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: /telegram types/i })).getByRole('button', {
        name: /Sensor Reset/i,
      }),
    ).toBeInTheDocument()
  })

  it('rejects a duplicate telegram code', () => {
    render(<TelegramsPage />)
    fireEvent.click(screen.getByRole('button', { name: /add type/i }))

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'MP' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Dupe' } })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i)
  })

  it('deletes a telegram type (and, with it, its fields)', () => {
    render(<TelegramsPage />)
    fireEvent.click(screen.getByRole('button', { name: /System Enter/i }))
    expect(screen.getByRole('heading', { name: /Message Builder: SE/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Delete SE telegram type/i }))

    const registry = screen.getByRole('group', { name: /telegram types/i })
    expect(within(registry).queryByRole('button', { name: /System Enter/i })).not.toBeInTheDocument()
    // Selection falls back to the first remaining type.
    expect(screen.getByRole('heading', { name: /Message Builder: MP/ })).toBeInTheDocument()
  })

  it('adds a field to a group in the current structure', () => {
    render(<TelegramsPage />)
    expect(fieldRows()).toHaveLength(6)

    fireEvent.click(screen.getByRole('button', { name: /add field to group 00/i }))
    expect(fieldRows()).toHaveLength(7)
    expect(screen.getByDisplayValue('Field_7')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /remove sender/i }))
    expect(screen.queryByDisplayValue('Sender')).not.toBeInTheDocument()
    expect(fieldRows()).toHaveLength(6)
  })

  it('adds a new group and a field inside it', () => {
    render(<TelegramsPage />)
    expect(screen.getByDisplayValue('DefaultTelegramHeader')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /add group/i }))
    expect(screen.getByDisplayValue('Group_1')).toBeInTheDocument()

    // The new group is the second one (index 01); add a field into it.
    fireEvent.click(screen.getByRole('button', { name: /add field to group 01/i }))
    expect(screen.getByDisplayValue('Field_7')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Group 01 name'), { target: { value: 'Body' } })
    expect(screen.getByDisplayValue('Body')).toBeInTheDocument()
  })

  it('removes a group and all of its fields', () => {
    render(<TelegramsPage />)
    expect(fieldRows()).toHaveLength(6)

    fireEvent.click(screen.getByRole('button', { name: /remove group 00/i }))
    expect(fieldRows()).toHaveLength(0)
    expect(screen.queryByDisplayValue('Sender')).not.toBeInTheDocument()
    // With no fields left, the structure cannot be saved.
    expect(screen.getByRole('button', { name: /save structure/i })).toBeDisabled()
  })

  it('reflects edited byte values in the raw stream output', () => {
    render(<TelegramsPage />)
    fireEvent.change(screen.getByLabelText('Sender default value'), { target: { value: 'AB' } })
    expect(screen.getByLabelText('Raw stream output').textContent).toContain('41 42')
  })

  it('saves structural edits and discards them on demand', () => {
    render(<TelegramsPage />)
    const saveButton = () => screen.getByRole('button', { name: /save structure/i })

    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    expect(saveButton()).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Field 00 length'), { target: { value: '6' } })
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.getByText('Total Length: 17 Bytes')).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: /discard/i }))
    expect(screen.getByText('Total Length: 13 Bytes')).toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Field 00 length'), { target: { value: '6' } })
    fireEvent.click(saveButton())
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()

    // Switch away and back: the saved structure persists.
    fireEvent.click(screen.getByRole('button', { name: /Fill Level/i }))
    fireEvent.click(screen.getByRole('button', { name: /Message Point/i }))
    expect(screen.getByText('Total Length: 17 Bytes')).toBeInTheDocument()
  })

  it('appends the default End-of-Telegram terminator and lets you change or clear it', () => {
    render(<TelegramsPage />)

    const eot = screen.getByLabelText('End of Telegram character')
    expect(eot).toHaveValue('~')
    // The default terminator is part of every telegram: 12 header bytes + 1.
    expect(screen.getByText('Total Length: 13 Bytes')).toBeInTheDocument()
    expect(screen.getByLabelText('Raw stream output').textContent).toContain('4D 50 00 00 7E')
    expect(screen.getByRole('group', { name: /End of Telegram bytes/i })).toBeInTheDocument()

    // Changing it re-encodes the trailing byte ('!' = 0x21).
    fireEvent.change(eot, { target: { value: '!' } })
    expect(screen.getByLabelText('Raw stream output').textContent).toContain('4D 50 00 00 21')

    // Clearing it drops the terminator entirely.
    fireEvent.change(eot, { target: { value: '' } })
    expect(screen.getByText('Total Length: 12 Bytes')).toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: /End of Telegram bytes/i }),
    ).not.toBeInTheDocument()
  })

  it('no longer offers XML import in the builder', () => {
    render(<TelegramsPage />)
    expect(screen.queryByRole('button', { name: /import xml/i })).not.toBeInTheDocument()
  })

  it('persists an added type and saved structure across a remount', () => {
    const { unmount } = render(<TelegramsPage />)

    // Add a new type...
    fireEvent.click(screen.getByRole('button', { name: /add type/i }))
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'sr' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sensor Reset' } })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    // ...and save a structural edit on it.
    fireEvent.change(screen.getByLabelText('Field 00 length'), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: /save structure/i }))

    // Reload the page from scratch: the saved registry rehydrates from storage.
    unmount()
    render(<TelegramsPage />)

    expect(
      within(screen.getByRole('group', { name: /telegram types/i })).getByRole('button', {
        name: /Sensor Reset/i,
      }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Sensor Reset/i }))
    expect(screen.getByRole('heading', { name: /Message Builder: SR/ })).toBeInTheDocument()
    expect(screen.getByText('Total Length: 17 Bytes')).toBeInTheDocument()
  })
})

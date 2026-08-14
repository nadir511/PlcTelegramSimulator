import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FieldRegistry } from './FieldRegistry'
import type { TelegramField, TelegramFieldGroup } from './types'

const FIELDS: TelegramField[] = [
  { id: 'a', name: 'Header', dataType: 'STRING', length: 4, defaultValue: 'STX' },
  { id: 'b', name: 'TelegramID', dataType: 'HEX', length: 2, defaultValue: '4D 50' },
  { id: 'c', name: 'Checksum', dataType: 'HEX', length: 2, defaultValue: '', auto: true },
]

function groupsOf(fields: TelegramField[]): TelegramFieldGroup[] {
  return [{ id: 'g1', name: 'DefaultTelegramHeader', fields }]
}

/** Field rows are those carrying a `Field NN name` input (not group/placeholder rows). */
function fieldRows(): HTMLElement[] {
  return within(screen.getByRole('table'))
    .getAllByRole('row')
    .filter((row) => within(row).queryByLabelText(/^Field \d+ name$/))
}

function renderRegistry(overrides?: {
  groups?: TelegramFieldGroup[]
  onAddField?: (groupId: string) => void
  onUpdateField?: (id: string, patch: Partial<Omit<TelegramField, 'id'>>) => void
  onRemoveField?: (id: string) => void
  onAddGroup?: () => void
  onRenameGroup?: (groupId: string, name: string) => void
  onRemoveGroup?: (groupId: string) => void
}) {
  const onAddField = overrides?.onAddField ?? vi.fn()
  const onUpdateField = overrides?.onUpdateField ?? vi.fn()
  const onRemoveField = overrides?.onRemoveField ?? vi.fn()
  const onAddGroup = overrides?.onAddGroup ?? vi.fn()
  const onRenameGroup = overrides?.onRenameGroup ?? vi.fn()
  const onRemoveGroup = overrides?.onRemoveGroup ?? vi.fn()
  render(
    <FieldRegistry
      groups={overrides?.groups ?? groupsOf(FIELDS)}
      onAddField={onAddField}
      onUpdateField={onUpdateField}
      onRemoveField={onRemoveField}
      onAddGroup={onAddGroup}
      onRenameGroup={onRenameGroup}
      onRemoveGroup={onRemoveGroup}
    />,
  )
  return { onAddField, onUpdateField, onRemoveField, onAddGroup, onRenameGroup, onRemoveGroup }
}

describe('FieldRegistry', () => {
  it('derives contiguous byte offsets across the whole type', () => {
    renderRegistry()
    const rows = fieldRows()
    // Offset cell is the 4th column (Idx, Name, Data Type, Offset, ...).
    expect(within(rows[0]).getAllByRole('cell')[3]).toHaveTextContent('0')
    expect(within(rows[1]).getAllByRole('cell')[3]).toHaveTextContent('4')
    expect(within(rows[2]).getAllByRole('cell')[3]).toHaveTextContent('6')
  })

  it('locks the default value of auto (computed) fields', () => {
    renderRegistry()
    const checksum = screen.getByLabelText('Checksum default value') as HTMLInputElement
    expect(checksum).toBeDisabled()
    expect(checksum).toHaveValue('Auto')
  })

  it('emits updates when a field is edited', () => {
    const { onUpdateField } = renderRegistry()
    fireEvent.change(screen.getByLabelText('Field 00 name'), { target: { value: 'Head' } })
    expect(onUpdateField).toHaveBeenCalledWith('a', { name: 'Head' })

    fireEvent.change(screen.getByLabelText('Field 01 data type'), { target: { value: 'INT' } })
    expect(onUpdateField).toHaveBeenCalledWith('b', { dataType: 'INT' })
  })

  it('surfaces a validation error for a bad default value', () => {
    const groups = groupsOf([{ id: 'x', name: 'N', dataType: 'HEX', length: 2, defaultValue: 'ZZ' }])
    renderRegistry({ groups })
    expect(screen.getByRole('alert')).toHaveTextContent(/hex byte pairs/i)
    expect(screen.getByLabelText('N default value')).toHaveAttribute('aria-invalid', 'true')
  })

  it('invokes callbacks for add-field, remove-field and add-group', () => {
    const { onAddField, onRemoveField, onAddGroup } = renderRegistry()
    fireEvent.click(screen.getByRole('button', { name: /add field to group 00/i }))
    expect(onAddField).toHaveBeenCalledWith('g1')

    fireEvent.click(screen.getByRole('button', { name: /remove telegramid/i }))
    expect(onRemoveField).toHaveBeenCalledWith('b')

    fireEvent.click(screen.getByRole('button', { name: /add group/i }))
    expect(onAddGroup).toHaveBeenCalledTimes(1)
  })

  it('renames and removes a group', () => {
    const { onRenameGroup, onRemoveGroup } = renderRegistry()
    fireEvent.change(screen.getByLabelText('Group 00 name'), { target: { value: 'Body' } })
    expect(onRenameGroup).toHaveBeenCalledWith('g1', 'Body')

    fireEvent.click(screen.getByRole('button', { name: /remove group 00/i }))
    expect(onRemoveGroup).toHaveBeenCalledWith('g1')
  })

  it('collapses and expands a group without losing its header', () => {
    renderRegistry()
    expect(screen.getByLabelText('Field 00 name')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /collapse group 00/i }))
    expect(screen.queryByLabelText('Field 00 name')).not.toBeInTheDocument()
    // The group header (name input) stays visible while collapsed.
    expect(screen.getByLabelText('Group 00 name')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /expand group 00/i }))
    expect(screen.getByLabelText('Field 00 name')).toBeInTheDocument()
  })
})

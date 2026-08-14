import { useState } from 'react'
import { DATA_TYPES } from './defaults'
import { allFields, validateField, withOffsets } from './format'
import type { DataType, TelegramField, TelegramFieldGroup } from './types'
import { Icon } from '@/components/ui/Icon'

interface FieldRegistryProps {
  groups: readonly TelegramFieldGroup[]
  onAddField: (groupId: string) => void
  onUpdateField: (id: string, patch: Partial<Omit<TelegramField, 'id'>>) => void
  onRemoveField: (id: string) => void
  onAddGroup: () => void
  onRenameGroup: (groupId: string, name: string) => void
  onRemoveGroup: (groupId: string) => void
}

const CELL_INPUT =
  'w-full rounded bg-background border border-outline-variant px-2 py-1 font-data-mono text-data-mono text-on-surface ' +
  'focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary aria-[invalid=true]:border-error'

const HEADERS = ['Idx', 'Field Name', 'Data Type', 'Offset', 'Length', 'Default Value', ''] as const

/** Editable table defining the grouped, ordered field structure of a telegram type. */
export function FieldRegistry({
  groups,
  onAddField,
  onUpdateField,
  onRemoveField,
  onAddGroup,
  onRenameGroup,
  onRemoveGroup,
}: FieldRegistryProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())
  const toggleGroup = (groupId: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })

  const fields = allFields(groups)
  // Byte offsets and the Idx column are global across every group, so map each
  // field id to its position in the flattened, contiguous layout.
  const meta = new Map<string, { offset: number; index: number }>()
  withOffsets(fields).forEach((positioned, index) => {
    meta.set(positioned.field.id, { offset: positioned.offset, index })
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded border border-outline-variant bg-surface-container-lowest">
      <div className="flex shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container px-3 py-2">
        <span className="flex items-center gap-2 font-label-xs text-label-xs uppercase text-on-surface-variant">
          <Icon name="data_object" className="text-[16px]" />
          Field Registry
        </span>
        <button
          type="button"
          onClick={onAddGroup}
          className="flex items-center gap-1 font-label-xs text-label-xs uppercase text-secondary transition-colors hover:text-secondary-fixed"
        >
          <Icon name="create_new_folder" className="text-[16px]" />
          Add Group
        </button>
      </div>

      <div className="overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-surface-container">
            <tr>
              {HEADERS.map((header, index) => (
                <th
                  key={header || `actions-${index}`}
                  scope="col"
                  className="border-b border-outline-variant px-3 py-2 font-label-xs text-label-xs uppercase text-on-surface-variant"
                >
                  {header || <span className="sr-only">Actions</span>}
                </th>
              ))}
            </tr>
          </thead>

          {groups.length === 0 ? (
            <tbody className="font-data-mono text-data-mono text-on-surface">
              <tr>
                <td colSpan={HEADERS.length} className="px-3 py-6 text-center text-on-surface-variant/70">
                  No groups yet — add a group to define this telegram&apos;s structure.
                </td>
              </tr>
            </tbody>
          ) : (
            groups.map((group, groupIndex) => {
              const gid = String(groupIndex).padStart(2, '0')
              const isCollapsed = collapsedGroups.has(group.id)
              return (
                <tbody key={group.id} className="font-data-mono text-data-mono text-on-surface">
                  <tr className="border-b border-outline-variant bg-surface-container/60">
                    <td colSpan={HEADERS.length} className="px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-expanded={!isCollapsed}
                            aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} group ${gid}`}
                            onClick={() => toggleGroup(group.id)}
                            className="rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-on-surface"
                          >
                            <Icon
                              name={isCollapsed ? 'chevron_right' : 'expand_more'}
                              className="text-[18px]"
                            />
                          </button>
                          <Icon name="folder" className="text-[16px] text-secondary" />
                          <input
                            type="text"
                            aria-label={`Group ${gid} name`}
                            value={group.name}
                            spellCheck={false}
                            autoComplete="off"
                            placeholder="Group name"
                            onChange={(event) => onRenameGroup(group.id, event.target.value)}
                            className={`${CELL_INPUT} w-64`}
                          />
                          <span className="font-label-xs text-label-xs text-on-surface-variant tabular-nums">
                            {group.fields.length} {group.fields.length === 1 ? 'field' : 'fields'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={`Add field to group ${gid}`}
                            onClick={() => onAddField(group.id)}
                            className="flex items-center gap-1 rounded px-2 py-1 font-label-xs text-label-xs uppercase text-secondary transition-colors hover:bg-surface-variant"
                          >
                            <Icon name="add" className="text-[16px]" />
                            Add Field
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove group ${gid}`}
                            onClick={() => onRemoveGroup(group.id)}
                            className="rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-error"
                          >
                            <Icon name="folder_delete" className="text-[18px]" />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>

                  {!isCollapsed && (group.fields.length === 0 ? (
                    <tr className="border-b border-outline-variant/50">
                      <td
                        colSpan={HEADERS.length}
                        className="px-3 py-4 text-center font-body-sm text-body-sm text-on-surface-variant/70"
                      >
                        No fields in this group yet — use “Add Field”.
                      </td>
                    </tr>
                  ) : (
                    group.fields.map((field) => {
                      const { offset, index } = meta.get(field.id) ?? { offset: 0, index: 0 }
                      const errors = validateField(field, fields)
                      const rowLabel = field.name.trim() || `field ${index + 1}`
                      const idx = String(index).padStart(2, '0')
                      return (
                        <tr key={field.id} className="border-b border-outline-variant/50 align-top">
                          <td className="px-3 py-2 text-center text-on-surface-variant">{idx}</td>

                          <td className="px-3 py-2">
                            <input
                              type="text"
                              aria-label={`Field ${idx} name`}
                              value={field.name}
                              spellCheck={false}
                              autoComplete="off"
                              aria-invalid={Boolean(errors.name)}
                              onChange={(event) => onUpdateField(field.id, { name: event.target.value })}
                              className={CELL_INPUT}
                            />
                            {errors.name ? (
                              <p role="alert" className="mt-1 font-label-xs text-label-xs text-error">
                                {errors.name}
                              </p>
                            ) : null}
                          </td>

                          <td className="px-3 py-2">
                            <select
                              aria-label={`Field ${idx} data type`}
                              value={field.dataType}
                              onChange={(event) =>
                                onUpdateField(field.id, { dataType: event.target.value as DataType })
                              }
                              className={CELL_INPUT}
                            >
                              {DATA_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {type}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="px-3 py-2 text-secondary tabular-nums">{offset}</td>

                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={1}
                              max={1024}
                              aria-label={`Field ${idx} length`}
                              value={Number.isNaN(field.length) ? '' : field.length}
                              aria-invalid={Boolean(errors.length)}
                              onChange={(event) =>
                                onUpdateField(field.id, { length: event.target.valueAsNumber })
                              }
                              className={`${CELL_INPUT} w-20`}
                            />
                            {errors.length ? (
                              <p role="alert" className="mt-1 font-label-xs text-label-xs text-error">
                                {errors.length}
                              </p>
                            ) : null}
                          </td>

                          <td className="px-3 py-2">
                            {field.auto ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  aria-label={`${rowLabel} default value`}
                                  value="Auto"
                                  disabled
                                  className={`${CELL_INPUT} w-20 text-on-surface-variant`}
                                />
                                <span className="font-label-xs text-label-xs uppercase text-on-surface-variant">
                                  CRC-16
                                </span>
                              </div>
                            ) : (
                              <>
                                <input
                                  type="text"
                                  aria-label={`${rowLabel} default value`}
                                  value={field.defaultValue}
                                  spellCheck={false}
                                  autoComplete="off"
                                  placeholder={placeholderFor(field.dataType)}
                                  aria-invalid={Boolean(errors.defaultValue)}
                                  onChange={(event) =>
                                    onUpdateField(field.id, { defaultValue: event.target.value })
                                  }
                                  className={CELL_INPUT}
                                />
                                {errors.defaultValue ? (
                                  <p role="alert" className="mt-1 font-label-xs text-label-xs text-error">
                                    {errors.defaultValue}
                                  </p>
                                ) : null}
                              </>
                            )}
                          </td>

                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              aria-label={`Remove ${rowLabel}`}
                              onClick={() => onRemoveField(field.id)}
                              className="rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-error"
                            >
                              <Icon name="delete" className="text-[18px]" />
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  ))}
                </tbody>
              )
            })
          )}
        </table>
      </div>
    </div>
  )
}

function placeholderFor(dataType: DataType): string {
  switch (dataType) {
    case 'HEX':
      return '4D 50'
    case 'INT':
      return '0'
    default:
      return 'text'
  }
}

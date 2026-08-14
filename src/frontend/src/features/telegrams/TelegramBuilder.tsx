import { ByteMapPreview } from './ByteMapPreview'
import { FieldRegistry } from './FieldRegistry'
import { allFields } from './format'
import type { TelegramField, TelegramType } from './types'
import { Icon } from '@/components/ui/Icon'

interface TelegramBuilderProps {
  draft: TelegramType
  isDirty: boolean
  isValid: boolean
  /** Registry-wide End-of-Telegram terminator, appended to the byte preview. */
  endOfTelegram: string
  onAddField: (groupId: string) => void
  onUpdateField: (id: string, patch: Partial<Omit<TelegramField, 'id'>>) => void
  onRemoveField: (id: string) => void
  onAddGroup: () => void
  onRenameGroup: (groupId: string, name: string) => void
  onRemoveGroup: (groupId: string) => void
  onSave: () => void
  onDiscard: () => void
}

/** Builder for one telegram type: its editable field structure + byte preview. */
export function TelegramBuilder({
  draft,
  isDirty,
  isValid,
  endOfTelegram,
  onAddField,
  onUpdateField,
  onRemoveField,
  onAddGroup,
  onRenameGroup,
  onRemoveGroup,
  onSave,
  onDiscard,
}: TelegramBuilderProps) {
  return (
    <section aria-labelledby="builder-heading" className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="builder-heading" className="font-headline-md text-headline-md text-on-surface">
            Message Builder: <span className="text-secondary">{draft.code}</span>
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">{draft.description}</p>
        </div>

        <div className="flex items-center gap-2">
          {isDirty ? (
            <span role="status" className="font-label-xs text-label-xs uppercase text-tertiary">
              Unsaved changes
            </span>
          ) : null}

          <button
            type="button"
            onClick={onDiscard}
            disabled={!isDirty}
            className="rounded border border-outline-variant px-3 py-1.5 font-label-xs text-label-xs uppercase text-on-surface-variant transition-colors hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-40"
          >
            Discard
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={!isDirty || !isValid}
            className="flex items-center gap-1 rounded bg-primary px-3 py-1.5 font-label-xs text-label-xs uppercase text-on-primary transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="save" filled className="text-[16px]" />
            Save Structure
          </button>
        </div>
      </div>

      <FieldRegistry
        groups={draft.groups}
        onAddField={onAddField}
        onUpdateField={onUpdateField}
        onRemoveField={onRemoveField}
        onAddGroup={onAddGroup}
        onRenameGroup={onRenameGroup}
        onRemoveGroup={onRemoveGroup}
      />

      <ByteMapPreview fields={allFields(draft.groups)} endOfTelegram={endOfTelegram} />
    </section>
  )
}

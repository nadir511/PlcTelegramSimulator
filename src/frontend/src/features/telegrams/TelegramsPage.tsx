import { useMemo } from 'react'
import { isTypeValid } from './format'
import { TelegramBuilder } from './TelegramBuilder'
import { TelegramTypeBar } from './TelegramTypeBar'
import type { TelegramType } from './types'
import { useTelegramTypes } from './useTelegramTypes'
import { Icon } from '@/components/ui/Icon'

interface TelegramsPageProps {
  /** Injectable for tests; defaults to the seeded, in-browser registry. */
  seed?: readonly TelegramType[]
}

/** Telegram Builder screen: pick a telegram type and define its field structure. */
export function TelegramsPage({ seed }: TelegramsPageProps) {
  const {
    types,
    selectedCode,
    draft,
    isDirty,
    endOfTelegram,
    selectType,
    addType,
    removeType,
    addField,
    updateField,
    removeField,
    addGroup,
    renameGroup,
    removeGroup,
    save,
    discard,
    setEndOfTelegram,
  } = useTelegramTypes(seed)

  const isValid = useMemo(() => (draft ? isTypeValid(draft) : false), [draft])

  return (
    <>
      <TelegramTypeBar
        types={types}
        selectedCode={selectedCode}
        onSelect={selectType}
        onAddType={addType}
        onRemoveType={removeType}
        endOfTelegram={endOfTelegram}
        onEndOfTelegramChange={setEndOfTelegram}
      />

      {draft ? (
        <TelegramBuilder
          draft={draft}
          isDirty={isDirty}
          isValid={isValid}
          endOfTelegram={endOfTelegram}
          onAddField={addField}
          onUpdateField={updateField}
          onRemoveField={removeField}
          onAddGroup={addGroup}
          onRenameGroup={renameGroup}
          onRemoveGroup={removeGroup}
          onSave={save}
          onDiscard={discard}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low p-10 text-on-surface-variant/70">
          <Icon name="swap_horiz" weight={300} className="text-4xl" />
          <p className="font-body-sm text-body-sm">
            No telegram type selected — add one to start building.
          </p>
        </div>
      )}
    </>
  )
}

import { useCallback, useMemo, useState } from 'react'
import { DEFAULT_END_OF_TELEGRAM, SEED_TELEGRAM_TYPES, defaultGroups } from './defaults'
import { allFields, validateNewType } from './format'
import type { TelegramField, TelegramFieldGroup, TelegramType } from './types'

let fieldSequence = 0
function nextFieldId(): string {
  fieldSequence += 1
  return `fld-${Date.now().toString(36)}-${fieldSequence}`
}

let groupSequence = 0
function nextGroupId(): string {
  groupSequence += 1
  return `grp-${Date.now().toString(36)}-${groupSequence}`
}

function cloneType(type: TelegramType): TelegramType {
  return {
    ...type,
    groups: type.groups.map((group) => ({
      ...group,
      fields: group.fields.map((field) => ({ ...field })),
    })),
  }
}

/** Serialisable projection used to detect unsaved edits. */
function signature(type: TelegramType | null): string {
  return type ? JSON.stringify(type) : ''
}

/** Picks the next field name that does not clash with any field in the type. */
function nextFieldName(fields: readonly TelegramField[]): string {
  const taken = new Set(fields.map((field) => field.name.trim().toLowerCase()))
  for (let index = fields.length + 1; ; index += 1) {
    const candidate = `Field_${index}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

/** Picks the next group name that does not clash with the existing ones. */
function nextGroupName(groups: readonly TelegramFieldGroup[]): string {
  const taken = new Set(groups.map((group) => group.name.trim().toLowerCase()))
  for (let index = 1; ; index += 1) {
    const candidate = `Group_${index}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

export interface AddTypeInput {
  code: string
  name: string
  description?: string
}

export interface AddTypeResult {
  ok: boolean
  error?: string
}

export interface UseTelegramTypesResult {
  /** Saved telegram types (the registry). */
  types: readonly TelegramType[]
  /** Code of the type currently open in the builder, or `''` when none. */
  selectedCode: string
  /** Editable working copy of the selected type, or `null` when the registry is empty. */
  draft: TelegramType | null
  /** Whether the draft has edits that have not been saved into the registry. */
  isDirty: boolean
  /** Registry-wide End-of-Telegram terminator appended to every telegram (empty = none). */
  endOfTelegram: string
  selectType: (code: string) => void
  addType: (input: AddTypeInput) => AddTypeResult
  /** Remove a telegram type (and, with it, all of its groups and fields). */
  removeType: (code: string) => void
  /** Append a field to the group identified by `groupId`. */
  addField: (groupId: string) => void
  updateField: (id: string, patch: Partial<Omit<TelegramField, 'id'>>) => void
  removeField: (id: string) => void
  /** Append a new, empty field group to the draft. */
  addGroup: () => void
  /** Rename the group identified by `groupId`. */
  renameGroup: (groupId: string, name: string) => void
  /** Remove a group (and every field it contains) from the draft. */
  removeGroup: (groupId: string) => void
  /** Commit the draft's structure back into the registry. */
  save: () => void
  /** Reload the draft from the saved type, discarding edits. */
  discard: () => void
  /** Set the registry-wide End-of-Telegram terminator (empty = none). */
  setEndOfTelegram: (value: string) => void
}

/**
 * Owns the in-browser telegram registry and the editable draft for the selected
 * type. Structural edits mutate the draft only; {@link save} commits them into
 * the registry (there is no backend template store yet — see ADR-0009).
 */
export function useTelegramTypes(
  seed: readonly TelegramType[] = SEED_TELEGRAM_TYPES,
): UseTelegramTypesResult {
  const [types, setTypes] = useState<TelegramType[]>(() => seed.map(cloneType))
  const [selectedCode, setSelectedCode] = useState<string>(() => seed[0]?.code ?? '')
  const [draft, setDraft] = useState<TelegramType | null>(() =>
    seed[0] ? cloneType(seed[0]) : null,
  )
  const [endOfTelegram, setEndOfTelegram] = useState<string>(DEFAULT_END_OF_TELEGRAM)

  const savedSelected = useMemo(
    () => types.find((type) => type.code === selectedCode) ?? null,
    [types, selectedCode],
  )

  const isDirty = useMemo(
    () => draft !== null && signature(draft) !== signature(savedSelected),
    [draft, savedSelected],
  )

  const selectType = useCallback(
    (code: string) => {
      const target = types.find((type) => type.code === code)
      if (!target) return
      setSelectedCode(code)
      setDraft(cloneType(target))
    },
    [types],
  )

  const addType = useCallback(
    ({ code, name, description }: AddTypeInput): AddTypeResult => {
      const errors = validateNewType(code, name, types)
      const message = errors.code ?? errors.name
      if (message) return { ok: false, error: message }

      const normalized = code.trim().toUpperCase()
      const created: TelegramType = {
        code: normalized,
        name: name.trim(),
        description: description?.trim() ?? '',
        // A fresh type starts with the default header group; the user extends it.
        groups: defaultGroups(normalized),
      }

      setTypes((current) => [...current, created])
      setSelectedCode(normalized)
      setDraft(cloneType(created))
      return { ok: true }
    },
    [types],
  )

  const removeType = useCallback(
    (code: string) => {
      const next = types.filter((type) => type.code !== code)
      setTypes(next)
      if (selectedCode === code) {
        const fallback = next[0] ?? null
        setSelectedCode(fallback?.code ?? '')
        setDraft(fallback ? cloneType(fallback) : null)
      }
    },
    [types, selectedCode],
  )

  const addField = useCallback((groupId: string) => {
    setDraft((current) => {
      if (!current) return current
      const newField: TelegramField = {
        id: nextFieldId(),
        name: nextFieldName(allFields(current.groups)),
        dataType: 'STRING',
        length: 1,
        defaultValue: '',
      }
      return {
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId ? { ...group, fields: [...group.fields, newField] } : group,
        ),
      }
    })
  }, [])

  const updateField = useCallback((id: string, patch: Partial<Omit<TelegramField, 'id'>>) => {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        groups: current.groups.map((group) => ({
          ...group,
          fields: group.fields.map((field) => (field.id === id ? { ...field, ...patch } : field)),
        })),
      }
    })
  }, [])

  const removeField = useCallback((id: string) => {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        groups: current.groups.map((group) => ({
          ...group,
          fields: group.fields.filter((field) => field.id !== id),
        })),
      }
    })
  }, [])

  const addGroup = useCallback(() => {
    setDraft((current) => {
      if (!current) return current
      const group: TelegramFieldGroup = {
        id: nextGroupId(),
        name: nextGroupName(current.groups),
        fields: [],
      }
      return { ...current, groups: [...current.groups, group] }
    })
  }, [])

  const renameGroup = useCallback((groupId: string, name: string) => {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId ? { ...group, name } : group,
        ),
      }
    })
  }, [])

  const removeGroup = useCallback((groupId: string) => {
    setDraft((current) => {
      if (!current) return current
      return { ...current, groups: current.groups.filter((group) => group.id !== groupId) }
    })
  }, [])

  const save = useCallback(() => {
    if (!draft) return
    const committed = cloneType(draft)
    setTypes((all) => all.map((type) => (type.code === committed.code ? committed : type)))
  }, [draft])

  const discard = useCallback(() => {
    if (savedSelected) setDraft(cloneType(savedSelected))
  }, [savedSelected])

  return {
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
  }
}

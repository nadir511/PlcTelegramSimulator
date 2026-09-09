import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadStoredTelegrams, persistTelegrams, serializeTelegrams } from './persistence'
import type { TelegramType } from './types'
import { useTelegramTypes } from './useTelegramTypes'

const oneType: TelegramType[] = [
  {
    code: 'AA',
    name: 'Alpha',
    description: 'Stored type.',
    groups: [
      {
        id: 'aa-header',
        name: 'DefaultTelegramHeader',
        fields: [{ id: 'aa-1', name: 'Sender', dataType: 'STRING', length: 2, defaultValue: 'CV' }],
      },
    ],
  },
]

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('useTelegramTypes persistence', () => {
  it('hydrates the registry from storage when no seed is injected', () => {
    localStorage.setItem('plc.telegrams.v1', serializeTelegrams(oneType, '!'))

    const { result } = renderHook(() => useTelegramTypes())

    expect(result.current.types.map((type) => type.code)).toEqual(['AA'])
    expect(result.current.selectedCode).toBe('AA')
    expect(result.current.endOfTelegram).toBe('!')
  })

  it('falls back to the built-in seeds when storage is empty', () => {
    const { result } = renderHook(() => useTelegramTypes())
    expect(result.current.types.map((type) => type.code)).toEqual(['MP', 'SL', 'SE', 'PD', 'FL'])
  })

  it('persists a new type added via Add Type', () => {
    const { result } = renderHook(() => useTelegramTypes())

    act(() => {
      result.current.addType({ code: 'sr', name: 'Sensor Reset' })
    })

    expect(loadStoredTelegrams()?.types.map((type) => type.code)).toContain('SR')
  })

  it('persists structural edits only when Save Structure commits them', () => {
    const { result } = renderHook(() => useTelegramTypes(oneType))

    act(() => {
      result.current.updateField('aa-1', { length: 6 })
    })
    // The draft edit is not yet committed, so storage still holds the original.
    expect(loadStoredTelegrams()?.types[0].groups[0].fields[0].length).toBe(2)

    act(() => {
      result.current.save()
    })
    expect(loadStoredTelegrams()?.types[0].groups[0].fields[0].length).toBe(6)
  })

  it('persists a removed type', () => {
    localStorage.setItem('plc.telegrams.v1', serializeTelegrams(oneType, '#'))
    const { result } = renderHook(() => useTelegramTypes())

    act(() => {
      result.current.removeType('AA')
    })

    expect(loadStoredTelegrams()?.types).toEqual([])
  })

  it('persists the End-of-Telegram terminator', () => {
    const { result } = renderHook(() => useTelegramTypes(oneType))

    act(() => {
      result.current.setEndOfTelegram('!')
    })

    expect(loadStoredTelegrams()?.endOfTelegram).toBe('!')
  })

  it('prefers an injected seed over stored data', () => {
    persistTelegrams(oneType, '#')
    const seed: TelegramType[] = [{ code: 'ZZ', name: 'Zeta', description: '', groups: [] }]

    const { result } = renderHook(() => useTelegramTypes(seed))

    expect(result.current.types.map((type) => type.code)).toEqual(['ZZ'])
  })
})

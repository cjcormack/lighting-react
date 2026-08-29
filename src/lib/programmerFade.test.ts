// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { useCallback } from 'react'
import { act, renderHook } from '@testing-library/react'
import {
  DEFAULT_PROGRAMMER_FADE,
  PROGRAMMER_FADE_KEY,
  getProgrammerFadeMs,
  resetProgrammerFadeStore,
  setProgrammerFade,
  useProgrammerFade,
} from './programmerFade'

afterEach(() => {
  window.localStorage.clear()
  resetProgrammerFadeStore()
})

describe('useProgrammerFade', () => {
  it('defaults to snap with nothing stored', () => {
    expect(renderHook(() => useProgrammerFade()).result.current).toBe(DEFAULT_PROGRAMMER_FADE)
    expect(getProgrammerFadeMs()).toBe(0)
  })

  it('reads a preference written by the older persisted-state hook', () => {
    // JSON-encoded, which is what `usePersistentState<string>` wrote before this became a store.
    window.localStorage.setItem(PROGRAMMER_FADE_KEY, JSON.stringify('3000'))
    expect(renderHook(() => useProgrammerFade()).result.current).toBe('3000')
    expect(getProgrammerFadeMs()).toBe(3000)
  })

  it('falls back to snap for a non-string or unparseable stored value', () => {
    window.localStorage.setItem(PROGRAMMER_FADE_KEY, JSON.stringify(3000))
    expect(renderHook(() => useProgrammerFade()).result.current).toBe(DEFAULT_PROGRAMMER_FADE)

    resetProgrammerFadeStore()
    window.localStorage.setItem(PROGRAMMER_FADE_KEY, 'not json at all')
    expect(renderHook(() => useProgrammerFade()).result.current).toBe(DEFAULT_PROGRAMMER_FADE)
  })

  it('answers 0 ms for junk', () => {
    window.localStorage.setItem(PROGRAMMER_FADE_KEY, JSON.stringify('half a bar'))
    expect(renderHook(() => useProgrammerFade()).result.current).toBe('half a bar')
    expect(getProgrammerFadeMs()).toBe(0)
  })

  it('persists the choice', () => {
    renderHook(() => useProgrammerFade())
    act(() => setProgrammerFade('1000'))
    expect(window.localStorage.getItem(PROGRAMMER_FADE_KEY)).toBe(JSON.stringify('1000'))
  })

  it('reaches Blind without a remount when the picker moves', () => {
    // The bug this store replaced: the action bar's picker and `useShowBarProps`'s Blind were two
    // `usePersistentState` instances of one key, each holding a mount-time snapshot. Moving the
    // picker never reached Blind, so it snapped for the rest of the page visit.
    const picker = renderHook(() => useProgrammerFade())
    // Blind's shape: a callback memoised on mount that reads the fade when it is pressed.
    const blind = renderHook(() => useCallback(() => getProgrammerFadeMs(), []))
    const onBlindAtMount = blind.result.current

    act(() => setProgrammerFade('5000'))

    expect(picker.result.current).toBe('5000')
    expect(onBlindAtMount()).toBe(5000)
  })
})

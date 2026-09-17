// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  BUSK_FOCUS_KEY,
  BUSK_SHEET_KEY,
  BUSK_WINDOW_DECIDED_KEY,
  applyBuskArrival,
  applyBuskViewOptions,
  defaultBuskFocus,
  defaultBuskRigRows,
  defaultBuskSheet,
  getBuskFocus,
  getBuskSheet,
  isBuskWindowDecided,
  resetBuskWindowStores,
  setBuskFocus,
  setBuskRigRows,
  setBuskSheet,
  toggleBuskSheet,
  useBuskFocus,
  useBuskRigRows,
  useBuskSheet,
  useBuskWindowDecided,
} from './buskWindow'
import { getLocalBuskPage, isFollowingBuskPage, resetBuskPageFollowStores } from './buskPageFollow'

/**
 * The busk view's per-window facts (busk-further plan §3.4, D5–D7): defaults from the surface until
 * the window chooses; `?focus=` / `?sheet=` latched once per tab; `rigRows` clamped to the rig; the
 * sheet as one fact whose fold is `none`.
 */

/** Stub `matchMedia` so each of the three queries answers as the named surface would. */
function surface({ short = false, cramped = false, wide = true } = {}) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('500px') ? short : query.includes('750px') ? cramped : wide,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }))
}

beforeEach(() => surface())

afterEach(() => {
  window.sessionStorage.clear()
  window.localStorage.clear()
  resetBuskWindowStores()
  resetBuskPageFollowStores()
  vi.unstubAllGlobals()
})

describe('the defaults ladder', () => {
  it('is Split · Speed · 3 rows on a desk screen', () => {
    const desk = { short: false, cramped: false, docks: true }
    expect(defaultBuskFocus(desk)).toBe('split')
    expect(defaultBuskSheet(desk)).toBe('speed')
    expect(defaultBuskRigRows(desk)).toBe(3)
  })

  it('folds the rail and shows 2 rows on an iPad in portrait, where docking would stack the page', () => {
    const portrait = { short: false, cramped: false, docks: false }
    expect(defaultBuskFocus(portrait)).toBe('split')
    expect(defaultBuskSheet(portrait)).toBe('none')
    expect(defaultBuskRigRows(portrait)).toBe(2)
  })

  it('keeps the rail open with 2 rows on an iPad in landscape, which is wide but cramped', () => {
    const landscape = { short: false, cramped: true, docks: true }
    expect(defaultBuskSheet(landscape)).toBe('speed')
    expect(defaultBuskRigRows(landscape)).toBe(2)
  })

  it('is Pads with the sheet folded on a short viewport — a landscape phone', () => {
    const phone = { short: true, cramped: true, docks: false }
    expect(defaultBuskFocus(phone)).toBe('pads')
    expect(defaultBuskSheet(phone)).toBe('none')
  })

  it('reads the surface through matchMedia, and the tab fact wins once chosen', () => {
    surface({ short: true, cramped: true, wide: false })
    expect(renderHook(() => useBuskFocus()).result.current).toBe('pads')
    expect(renderHook(() => useBuskSheet()).result.current).toBe('none')
    expect(getBuskFocus()).toBe('pads')
    act(() => setBuskFocus('rig'))
    expect(renderHook(() => useBuskFocus()).result.current).toBe('rig')
    expect(getBuskFocus()).toBe('rig')
  })

  it('answers the desk default where matchMedia is missing, rather than throwing', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(renderHook(() => useBuskFocus()).result.current).toBe('split')
    // No `matchMedia` means no `docks` answer either, so the sheet rests folded.
    expect(renderHook(() => useBuskSheet()).result.current).toBe('none')
  })
})

describe('per-tab storage', () => {
  it('lives in sessionStorage — one value per tab — and never in localStorage', () => {
    act(() => {
      setBuskFocus('pads')
      setBuskSheet('none')
    })
    expect(window.sessionStorage.getItem(BUSK_FOCUS_KEY)).toBe('"pads"')
    expect(window.sessionStorage.getItem(BUSK_SHEET_KEY)).toBe('"none"')
    expect(window.localStorage.getItem(BUSK_FOCUS_KEY)).toBeNull()
  })

  it('reads a reloaded tab back into the shape it had, and junk as the default', () => {
    window.sessionStorage.setItem(BUSK_FOCUS_KEY, '"rig"')
    window.sessionStorage.setItem(BUSK_SHEET_KEY, '"nope"')
    expect(renderHook(() => useBuskFocus()).result.current).toBe('rig')
    expect(renderHook(() => useBuskSheet()).result.current).toBe('speed')
  })

  it('moves every reader together', () => {
    const a = renderHook(() => useBuskSheet())
    const b = renderHook(() => useBuskSheet())
    act(() => setBuskSheet('none'))
    expect(a.result.current).toBe('none')
    expect(b.result.current).toBe('none')
  })
})

describe('rigRows', () => {
  it('is clamped to the rig on read, without rewriting the wish', () => {
    act(() => setBuskRigRows(5))
    expect(renderHook(() => useBuskRigRows(4)).result.current).toBe(4)
    expect(renderHook(() => useBuskRigRows(2)).result.current).toBe(2)
    // The rig grows back and the window shows what it asked for, not what the clamp said.
    expect(renderHook(() => useBuskRigRows(6)).result.current).toBe(5)
    expect(renderHook(() => useBuskRigRows(0)).result.current).toBe(0)
  })

  it('never stores fewer than one row', () => {
    act(() => setBuskRigRows(0))
    expect(renderHook(() => useBuskRigRows(4)).result.current).toBe(1)
  })
})

describe('the sheet is one fact', () => {
  it('has no open flag beside it: none is the fold, and setting a tab opens it', () => {
    act(() => setBuskSheet('none'))
    expect(getBuskSheet()).toBe('none')
    act(() => setBuskSheet('speed'))
    expect(getBuskSheet()).toBe('speed')
    expect(Object.keys(window.sessionStorage).filter((k) => /open/i.test(k))).toEqual([])
  })

  it('toggles between the fold and the tab that was last open', () => {
    act(() => setBuskSheet('speed'))
    act(() => toggleBuskSheet())
    expect(getBuskSheet()).toBe('none')
    act(() => toggleBuskSheet())
    expect(getBuskSheet()).toBe('speed')
  })

  it('remembers only a live tab, so a hidden one cannot make the toggle flip fold to fold', () => {
    // A `?sheet=colour` link before session 5: drawn as the fold, and the MIDI BuskSheetToggle
    // must still open something.
    applyBuskArrival({ focus: null, sheet: 'colour' })
    expect(getBuskSheet()).toBe('colour')
    act(() => toggleBuskSheet())
    expect(getBuskSheet()).toBe('speed')
    act(() => toggleBuskSheet())
    expect(getBuskSheet()).toBe('none')
  })

  it('unfolds onto Speed when nothing has been open yet', () => {
    surface({ wide: false })
    expect(getBuskSheet()).toBe('none')
    act(() => toggleBuskSheet())
    expect(getBuskSheet()).toBe('speed')
  })
})

describe('arrival', () => {
  it('takes ?focus= and ?sheet= once, and marks the tab decided', () => {
    applyBuskArrival({ focus: 'pads', sheet: 'none' })
    expect(getBuskFocus()).toBe('pads')
    expect(getBuskSheet()).toBe('none')
    expect(isBuskWindowDecided()).toBe(true)
    expect(window.sessionStorage.getItem(BUSK_WINDOW_DECIDED_KEY)).toBe('true')
  })

  it('is a no-op the second time — a reload is never an arrival', () => {
    applyBuskArrival({ focus: 'pads', sheet: null })
    act(() => setBuskFocus('rig'))
    // The mirror has written `?focus=rig` by now; a reload finds it and must not read it as new.
    applyBuskArrival({ focus: 'split', sheet: 'speed' })
    expect(getBuskFocus()).toBe('rig')
    expect(getBuskSheet()).toBe('speed')
  })

  it('records that it decided even when it arrived with neither parameter', () => {
    applyBuskArrival({ focus: null, sheet: null })
    expect(isBuskWindowDecided()).toBe(true)
    expect(getBuskFocus()).toBe('split')
  })

  it('ignores a value outside the vocabulary and still decides', () => {
    applyBuskArrival({ focus: 'sideways', sheet: 'cheese' })
    expect(getBuskFocus()).toBe('split')
    expect(getBuskSheet()).toBe('speed')
    expect(isBuskWindowDecided()).toBe(true)
  })

  it('renders the decision one commit behind the live read', () => {
    const { result } = renderHook(() => useBuskWindowDecided())
    expect(result.current).toBe(false)
    act(() => applyBuskArrival({ focus: null, sheet: null }))
    expect(result.current).toBe(true)
  })
})

describe('applyBuskViewOptions', () => {
  it('sets focus and sheet from a frame, and reports what changed', () => {
    expect(applyBuskViewOptions({ focus: 'rig', sheet: 'none' })).toEqual({ focus: 'rig', sheet: 'none' })
    expect(getBuskFocus()).toBe('rig')
    expect(getBuskSheet()).toBe('none')
  })

  it('flips the fold and the last open tab on sheet: toggle', () => {
    act(() => setBuskSheet('speed'))
    expect(applyBuskViewOptions({ sheet: 'toggle' })).toEqual({ sheet: 'none' })
    expect(applyBuskViewOptions({ sheet: 'toggle' })).toEqual({ sheet: 'speed' })
  })

  it('unlinks this window onto a page, exactly as arriving with ?page= does (D13)', () => {
    expect(applyBuskViewOptions({ page: '3' })).toEqual({ page: 3 })
    expect(isFollowingBuskPage()).toBe(false)
    expect(getLocalBuskPage()).toBe(3)
  })

  it('ignores keys it does not contribute, and values outside the vocabulary', () => {
    expect(applyBuskViewOptions({ focus: 'sideways', sheet: 'cheese', page: '-1', rigRows: '2', zoom: '3' })).toEqual({})
    expect(isFollowingBuskPage()).toBe(true)
  })
})

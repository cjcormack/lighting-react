// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  applyListSelection,
  listSelectionIntentFor,
  useListSelection,
  type ListSelectionState,
} from './useListSelection'

const ORDER = ['g1', 'a', 'b', 'c', 'g2', 'd'] as const
const order = [...ORDER]

const empty: ListSelectionState = { ids: [], anchor: null }

describe('listSelectionIntentFor', () => {
  it('maps modifiers to intents', () => {
    const base = { shiftKey: false, metaKey: false, ctrlKey: false }
    expect(listSelectionIntentFor(base)).toBe('replace')
    expect(listSelectionIntentFor({ ...base, shiftKey: true })).toBe('range')
    expect(listSelectionIntentFor({ ...base, metaKey: true })).toBe('toggle')
    expect(listSelectionIntentFor({ ...base, ctrlKey: true })).toBe('toggle')
    expect(listSelectionIntentFor({ ...base, shiftKey: true, metaKey: true })).toBe('range-add')
  })
})

describe('applyListSelection', () => {
  it('replaces by default and sets the anchor', () => {
    expect(applyListSelection(empty, { id: 'b', intent: 'replace' }, order)).toEqual({
      ids: ['b'],
      anchor: 'b',
    })
  })

  it('toggle adds (moving the anchor) and removes (anchor falls back)', () => {
    let state = applyListSelection(empty, { id: 'a', intent: 'toggle' }, order)
    state = applyListSelection(state, { id: 'c', intent: 'toggle' }, order)
    expect(state).toEqual({ ids: ['a', 'c'], anchor: 'c' })

    state = applyListSelection(state, { id: 'c', intent: 'toggle' }, order)
    expect(state).toEqual({ ids: ['a'], anchor: 'a' })
  })

  it('range selects the slice between anchor and click, in either direction', () => {
    const anchored = applyListSelection(empty, { id: 'b', intent: 'replace' }, order)
    expect(applyListSelection(anchored, { id: 'g2', intent: 'range' }, order).ids).toEqual([
      'b',
      'c',
      'g2',
    ])
    expect(applyListSelection(anchored, { id: 'g1', intent: 'range' }, order).ids).toEqual([
      'g1',
      'a',
      'b',
    ])
  })

  it('successive shift-clicks re-pivot from the same anchor', () => {
    let state = applyListSelection(empty, { id: 'b', intent: 'replace' }, order)
    state = applyListSelection(state, { id: 'd', intent: 'range' }, order)
    expect(state.ids).toEqual(['b', 'c', 'g2', 'd'])
    // Second shift-click shrinks back toward the anchor rather than extending.
    state = applyListSelection(state, { id: 'c', intent: 'range' }, order)
    expect(state).toEqual({ ids: ['b', 'c'], anchor: 'b' })
  })

  it('range-add unions the slice with the existing selection, keeping the anchor', () => {
    let state = applyListSelection(empty, { id: 'a', intent: 'replace' }, order)
    state = applyListSelection(state, { id: 'd', intent: 'toggle' }, order)
    expect(state).toEqual({ ids: ['a', 'd'], anchor: 'd' })
    // Anchor d, slice g2..d — unioned with the existing {a, d}.
    state = applyListSelection(state, { id: 'g2', intent: 'range-add' }, order)
    expect([...state.ids].sort()).toEqual(['a', 'd', 'g2'])
    expect(state.anchor).toBe('d')
  })

  it('degrades a range to replace when the anchor is filtered out of view', () => {
    const state: ListSelectionState = { ids: ['zz'], anchor: 'zz' }
    expect(applyListSelection(state, { id: 'c', intent: 'range' }, order)).toEqual({
      ids: ['c'],
      anchor: 'c',
    })
  })

  it('ignores a range click on an id not in the visible order', () => {
    const state = applyListSelection(empty, { id: 'b', intent: 'replace' }, order)
    expect(applyListSelection(state, { id: 'gone', intent: 'range' }, order)).toBe(state)
  })
})

describe('useListSelection', () => {
  it('orders selection by visible row order regardless of click order', () => {
    const { result } = renderHook(() => useListSelection(order))
    act(() => result.current.select('d', 'toggle'))
    act(() => result.current.select('a', 'toggle'))
    expect(result.current.orderedSelected).toEqual(['a', 'd'])
    expect(result.current.count).toBe(2)
    expect(result.current.isSelected('a')).toBe(true)
    expect(result.current.isSelected('b')).toBe(false)
  })

  it('selectAll selects the whole visible order; clear empties', () => {
    const { result } = renderHook(() => useListSelection(order))
    act(() => result.current.selectAll())
    expect(result.current.orderedSelected).toEqual(order)
    act(() => result.current.clear())
    expect(result.current.count).toBe(0)
    expect(result.current.anchor).toBeNull()
  })

  it('keeps a stable object identity while the selection is unchanged', () => {
    const { result, rerender } = renderHook(() => useListSelection(order))
    act(() => result.current.select('a'))
    const before = result.current
    rerender()
    expect(result.current).toBe(before)
    act(() => result.current.select('b', 'toggle'))
    expect(result.current).not.toBe(before)
  })
})

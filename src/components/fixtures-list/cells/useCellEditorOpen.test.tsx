// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCellEditorOpen } from './useCellEditorOpen'

/**
 * The rule behind `PD-POPUP-AFTER-DRAG`'s auto-open, tested where it is one rule rather than four.
 * That it opens a real editor is asserted through a real cell in `FixturesTable.test.tsx`.
 */
describe('useCellEditorOpen', () => {
  it('opens when the signal arrives', () => {
    const { result, rerender } = renderHook(({ autoOpen }) => useCellEditorOpen({ autoOpen }), {
      initialProps: { autoOpen: false },
    })
    expect(result.current.isOpen).toBe(false)
    rerender({ autoOpen: true })
    expect(result.current.isOpen).toBe(true)
  })

  it('does not reopen when the operator has closed it', () => {
    // `FixturesTable` drops the signal as soon as it is delivered, so `autoOpen` goes false on its
    // own — but a re-render of the row while it is still true must not fight the operator either.
    const { result, rerender } = renderHook(({ autoOpen }) => useCellEditorOpen({ autoOpen }), {
      initialProps: { autoOpen: true },
    })
    expect(result.current.isOpen).toBe(true)
    act(() => result.current.setOpen(false))
    expect(result.current.isOpen).toBe(false)
    rerender({ autoOpen: true })
    expect(result.current.isOpen).toBe(false)
  })

  it('ignores the signal on a cell that cannot be edited', () => {
    // Output scope, a focused template layer, an unreachable desk.
    const { result } = renderHook(() => useCellEditorOpen({ autoOpen: true, disabled: true }))
    expect(result.current.isOpen).toBe(false)
  })

  it('does not spring open later when a read-only cell becomes editable', () => {
    // `disabled` is read at the instant the signal flips and never again. A scope switched to
    // Local minutes after a drag must not act on that drag.
    const { result, rerender } = renderHook(
      ({ disabled }) => useCellEditorOpen({ autoOpen: true, disabled }),
      { initialProps: { disabled: true } },
    )
    rerender({ disabled: false })
    expect(result.current.isOpen).toBe(false)
  })

  it('runs `onOpen` for an auto-open as well as for a click', () => {
    // SliderCell's typed-input reset. A click resets it through `onOpenChange`; an auto-open never
    // goes through that handler, so the reset has to live here or the field would open holding
    // text typed for the previous value.
    const onOpen = vi.fn()
    const { result, rerender } = renderHook(
      ({ autoOpen }) => useCellEditorOpen({ autoOpen, onOpen }),
      { initialProps: { autoOpen: false } },
    )
    rerender({ autoOpen: true })
    expect(onOpen).toHaveBeenCalledTimes(1)

    act(() => result.current.setOpen(false))
    expect(onOpen).toHaveBeenCalledTimes(1)
    act(() => result.current.setOpen(true))
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('keeps `setOpen` stable across a changing `onOpen`', () => {
    // The cells pass a fresh inline arrow every render of their row, and a rig re-renders these
    // constantly; `setOpen` is a popover's `onOpenChange` and should not churn with it.
    const { result, rerender } = renderHook(() => useCellEditorOpen({ onOpen: () => {} }))
    const first = result.current.setOpen
    rerender()
    expect(result.current.setOpen).toBe(first)
  })
})

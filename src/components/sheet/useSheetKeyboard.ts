import { useEffect } from 'react'
import { isEditableTarget } from '@/lib/domUtils'
import { cellEditorIsOpen } from './cells/CellEditorSurface'
import { marqueeOwnsKeyTarget } from './cellEntry'
import type { CellKeyboardPermission } from './cellEntry'
import type { RowId } from './cellSelectionModel'

/** A cell gesture the surface's permission refused, and the key that asked for it. */
export interface SheetKeyRefusal {
  gesture: 'entry' | 'clear'
  /** `KeyboardEvent.key` — `'Enter'`, `'Backspace'`, `'Delete'`, or the character typed. */
  key: string
}

/**
 * The window-level keys a sheet's cell selection answers: Escape, Enter, a typed character,
 * Backspace / Delete.
 *
 * The programmer's container keeps its own copy of this dispatch, interleaved with its row
 * shortcuts (⌘A, ↑/↓, →/←) in one bubble-phase listener, and it is deliberately not rewired onto
 * this hook — its behaviour is pinned by `FixturesTable.test.tsx` and the rule here is the same
 * one. The three sheets the kit added mount this instead (CLAUDE.md §Sheet kit).
 *
 * **It listens in the capture phase**, which is the one thing it does differently, and for two
 * reasons. The cue sheet lives under `useTransportKeys`, whose `L` toggles the show lock from a
 * bubble listener whether or not the transport is enabled; a name typed into a cue cell begins
 * with a character, and `l` is one. Capture runs first whatever the registration order, so this
 * hook claims the character with `preventDefault()` and the transport stands aside. And Escape's
 * ladder needs to know whether an editor is open *before* Radix closes it: Radix listens on the
 * document, so a bubble listener on the window always sees the panel already gone and clears the
 * selection anyway — the programmer answers that with a separate capture-phase snapshot
 * (`useEscapeEditorSnapshot`); here the question is asked at the moment it is answered.
 *
 * The rest is the programmer's rule word for word. **Not from a focused control**, on every arm: a
 * cell trigger is tabbable and Tab-then-Enter selecting that cell is a path the grid promises, and
 * a Radix menu is `role="menu"`, so a `[role="dialog"]` guard does not cover a menu item — except a
 * cell trigger the marquee itself covers (`marqueeOwnsKeyTarget`), or Enter there would fall
 * through to that button's own activation. Backspace is the destructive arm, so it is the one that
 * most needs to know a chip or a menu item had the focus.
 */
export function useSheetKeyboard<C extends string>({
  cellCount,
  permission,
  isCellSelected,
  onEscape,
  onOpen,
  onClear,
  onRefused,
}: {
  /** How many cells are selected — zero means the cell arms are inert and only Escape is heard. */
  cellCount: number
  /** The surface's gate; a refused key is left to whoever else wants it. */
  permission: CellKeyboardPermission
  isCellSelected: (rowId: RowId, col: C) => boolean
  /** Escape with no editor open: the cells-then-rows ladder. */
  onEscape: () => void
  /** Enter (`''`) or a character: open the first selected cell's editor, seeded. */
  onOpen: (seed: string) => void
  /** Backspace / Delete: clear the selected cells. */
  onClear: () => void
  /**
   * A cell gesture was aimed at the selection and [permission] refused it. Given, the surface gets
   * a chance to say why and offer a way out; absent, the key is swallowed as it always was.
   *
   * **The surface decides which keys it may claim, not this hook.** Return true to claim the key —
   * the hook then `preventDefault()`s it — or false/undefined to leave it to whoever else wants it.
   * Which keys are safe to take depends entirely on what else the *surface* has bound, which is
   * knowledge this file has no business holding: the cue sheet claims Enter alone, because while a
   * show is locked `useTransportKeys` owns Backspace (BACK) and a typed `l` (the lock toggle, the
   * keyboard's own way back to editing), and both of those stand aside on `defaultPrevented`.
   * That reasoning lives in `CueSheet`, beside the hook it is about.
   */
  onRefused?: (refusal: SheetKeyRefusal) => boolean | void
}): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target instanceof Element ? e.target : null)) return
      if (e.target instanceof HTMLElement && e.target.closest('[role="dialog"]')) return

      if (e.key === 'Escape') {
        // An open editor takes Escape first, and keeps the selection: Radix will close it from its
        // own document listener, and the selection it was opened for survives. Asked here, in
        // capture, while the panel is still mounted.
        if (cellEditorIsOpen()) return
        onEscape()
        return
      }
      if (cellCount === 0) return
      const onControl =
        !marqueeOwnsKeyTarget(e.target, isCellSelected) &&
        e.target instanceof HTMLElement &&
        e.target.closest('button, a, [role="menuitem"], [role="menu"]') != null
      if (e.metaKey || e.ctrlKey || e.altKey || onControl) return
      if (e.key === 'Enter') {
        if (!permission.entry) {
          if (onRefused?.({ gesture: 'entry', key: e.key }) === true) e.preventDefault()
          return
        }
        e.preventDefault()
        onOpen('')
        return
      }
      if (/^[0-9a-z.]$/i.test(e.key)) {
        // A digit or a dot is the start of a number, and a letter is the start of a type-ahead —
        // so the character that opens an editor is anything a field on the other side could want,
        // and each editor takes the ones it can use.
        if (!permission.entry) {
          if (onRefused?.({ gesture: 'entry', key: e.key }) === true) e.preventDefault()
          return
        }
        e.preventDefault()
        onOpen(e.key)
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (!permission.clear) {
          if (onRefused?.({ gesture: 'clear', key: e.key }) === true) e.preventDefault()
          return
        }
        e.preventDefault()
        onClear()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [cellCount, permission.entry, permission.clear, isCellSelected, onEscape, onOpen, onClear, onRefused])
}

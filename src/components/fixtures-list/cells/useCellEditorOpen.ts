import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A cell editor's open state, plus the one way it opens without a click.
 *
 * All four cell editors are popovers over a trigger inside the cell, and all four now need the
 * same three things: local open state, a handler for the popover's `onOpenChange`, and the
 * auto-open the container asks for over a selection — Enter, or the selection bar's Set. (A
 * released single-column marquee used to ask for it too, `PD-POPUP-AFTER-DRAG`; that went when
 * the bar gained Set.) Written once here rather than four times, because it is one rule — and as
 * a per-cell hook rather than a coordinator above the table, because `CueValueGrid` mounts these
 * same four components directly, with no `FixturesTable` over them to coordinate from.
 *
 * **`onBeginEdit` is deliberately not part of it.** That callback exists to select the cell a click
 * landed on, and each cell still calls it from its own `onOpenChange` — but an auto-open must
 * not. Its cell is inside the marquee by construction, where `handleBeginCellEdit`
 * short-circuits, so calling it would be a no-op at best; at worst, if the marquee's cells had not
 * yet reached the selection it reads, it would take the "clicked outside" arm and replace the very
 * selection the gesture just made with one cell. [onOpen] is for the rest of what a click's open does —
 * `SliderCell`'s typed-input reset — which an auto-open *does* want.
 *
 * A [disabled] cell ignores the signal: Output scope, a focused template layer and an unreachable
 * desk stay read-only through this door as much as through the pointer. Nothing needs consuming
 * here, because `FixturesTable` drops the signal itself the moment it has been delivered — see the
 * `autoOpenCell` docblock there for why that job cannot be left to whichever cell it names.
 *
 * It also owns the closing rule that is nobody's click: **an editor belongs to a selection, so it
 * goes when the selection does** — see [selectionEmpty].
 */
export function useCellEditorOpen({
  autoOpen,
  keyboardSeed,
  disabled,
  onOpen,
  selectionEmpty,
}: {
  autoOpen?: boolean
  /**
   * The auto-open came from a **character typed at the grid**, and this is that character (`''`
   * for a bare Enter or the bar's Set). Null for a click, which carries none.
   *
   * Seeding only: which field has focus is not a function of how the editor was opened — see
   * `useCellEditorKeyboard`. Latched into [keyboardOpen] at the moment the editor opens, because
   * the signal itself is a one-shot the table drops on the very next commit while the editor
   * stays open for as long as the operator is typing into it.
   */
  keyboardSeed?: string | null
  disabled?: boolean
  /** State a click's `onOpenChange(true)` resets, that an auto-open must reset too. */
  onOpen?: () => void
  /**
   * Nothing at all is selected — neither a marquee nor a row. Undefined where the question does
   * not arise (`CueValueGrid` mounts these cells with no selection above them).
   *
   * An open editor is open *for* a selection: opening one on an unselected cell selects that cell,
   * and opening one inside a marquee is the whole marquee's editor. So Deselect leaves an editor
   * on screen that still writes — but to something narrower than the count above it claimed, and
   * with no visible selection left to explain what. That was true of the popover long before the
   * sheet, and it is worse in a sheet, which covers the grid that would otherwise show you.
   */
  selectionEmpty?: boolean
}): {
  isOpen: boolean
  setOpen: (open: boolean) => void
  /**
   * Non-null while an editor opened by a typed character is open, holding that character, for the
   * editor to seed its first field with — see [keyboardSeed].
   */
  keyboardOpen: string | null
} {
  const [isOpen, setIsOpen] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState<string | null>(null)

  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen
  // `viaKeyboard` is the auto-open's own business: every other caller is a click, and passing it
  // as a second argument keeps `setOpen` assignable to Radix's `(open: boolean) => void`.
  const setOpen = useCallback((next: boolean, viaKeyboard: string | null = null) => {
    if (next) onOpenRef.current?.()
    setKeyboardOpen(next ? viaKeyboard : null)
    setIsOpen(next)
  }, [])

  // Read through a ref so the effect depends on the signal alone. `disabled` is wanted as it is at
  // the instant the signal flips, never as a reason to run again — a cell that becomes editable
  // later must not spring open on the strength of a drag that has long since ended.
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled
  // Read through a ref for the same reason `disabled` is: it is wanted as it is at the instant the
  // signal flips, and a later change to it is not a reason to reopen anything.
  const keyboardSeedRef = useRef(keyboardSeed)
  keyboardSeedRef.current = keyboardSeed
  useEffect(() => {
    if (!autoOpen || disabledRef.current) return
    setOpen(true, keyboardSeedRef.current ?? null)
  }, [autoOpen, setOpen])

  // **The edge, not the state.** Closing whenever `selectionEmpty` is merely *true* would refuse
  // to open at all in a grid that has no selection to begin with — and the close would land in the
  // effect after the very click that opened it, so the editor would flicker rather than fail
  // visibly. Only the false→true crossing is a deselection.
  const hadSelectionRef = useRef(selectionEmpty === false)
  useEffect(() => {
    const deselected = selectionEmpty === true && hadSelectionRef.current
    hadSelectionRef.current = selectionEmpty === false
    if (deselected) {
      setIsOpen(false)
      setKeyboardOpen(null)
    }
  }, [selectionEmpty])

  return { isOpen, setOpen, keyboardOpen }
}

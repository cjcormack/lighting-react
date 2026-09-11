import type { Ref } from 'react'
import { Delete, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FanPopover, type FanColumn } from './FanPopover'
import { PHONE_FOLDED_CLASS, WORD_CLASS } from './SelectionToolbar'
import type { CellActionCopy } from './cellEntry'

/**
 * The selection bar's verbs for a **cell** selection: Set, Clear, Fan.
 *
 * Set and Clear are the marquee's two keys with a button on them — Enter and Backspace — and they
 * exist because a phone has neither, and because a released drag no longer opens an editor by
 * itself: the gesture says *what* to edit, and this is where the operator says *do it*. Both take
 * the container's own answer (`cellKeyboardPermission`) for whether they are enabled, and the
 * container's own words (`cellActionCopy`) for why not, so a button can never promise a gesture the
 * grid refuses. Fan moved here from the row toolbar when it started reading the marquee rather
 * than the fixture selection.
 *
 * Set and Clear keep their icons at every width; only Fan folds on the phone arm. On a phone Set
 * is the only way into a selection's editor, and Clear the only way to un-busk one cell without
 * clearing the programmer — so the two controls the phone has no key for are the two it keeps.
 */
export function CellSelectionActions({
  copy,
  canSet,
  setRef,
  onSet,
  canClear,
  onClear,
  fanColumns,
}: {
  copy: CellActionCopy
  canSet: boolean
  /**
   * The Set button itself, which is where the editor it opens is anchored — see `editorAnchorRef`
   * on `FixturesTable`. The panel belongs to the cell that owns it, so the button is handed down
   * to the grid rather than the editor being hoisted up here.
   */
  setRef?: Ref<HTMLButtonElement>
  /** Open the selection's editor, or close the one this button opened. */
  onSet: () => void
  canClear: boolean
  onClear: () => void
  fanColumns: readonly FanColumn[]
}) {
  return (
    <>
      <Button
        ref={setRef}
        variant="outline"
        size="sm"
        disabled={!canSet}
        onClick={onSet}
        title={copy.setTitle}
        aria-label="Set"
      >
        <Pencil className="size-3.5" />
        <span className={WORD_CLASS}>Set</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!canClear}
        onClick={onClear}
        title={copy.clearTitle}
        aria-label="Clear cells"
      >
        <Delete className="size-3.5" />
        <span className={WORD_CLASS}>Clear</span>
      </Button>
      <FanPopover columns={fanColumns} className={PHONE_FOLDED_CLASS} />
    </>
  )
}

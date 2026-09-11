import type { ColumnKey } from './columns'
import type { CellRef } from './cellSelectionModel'
import type { RowId } from './rowModel'
import type { ProgrammerScope } from '../programmer/ProgrammerScope'

/**
 * The keyboard half of the marquee: which cell a keystroke opens, and which scopes may take one.
 *
 * The gesture is spreadsheet-shaped — select cells, press Enter (or just start typing) and an
 * editor opens over them — but **which** editor is the thing that changed. It used to be one of
 * its own: a single-line field (`CellEntryPopover`) with a grammar of its own (`parseCellEntry`)
 * for `#ff8800`, `50%`, `full` and `pan,tilt`, which existed because the keyboard had no way into
 * the editor a *click* opens. So every column had two editors, and only one of them could be
 * improved at a time.
 *
 * Now there is one. Enter opens the ordinary cell editor at the first selected cell, with its
 * first field focused (`useCellEditorKeyboard`), and a character typed at the grid arrives in that
 * field as its first keystroke.
 *
 * **The grammar went with the field, and three of its words went for good.** A hex colour typed as
 * text is replaced in kind — the picker and the R/G/B boxes say the same thing. `pan,tilt` and
 * `r,g,b` survive as a *gesture* rather than a grammar: comma steps to the next field, which is
 * what the position editor's new pair of boxes is for. But **`50%`, `full` and `out` are simply
 * gone**, and nothing says them instead: the level editor's box is `type="number"`, so those
 * characters cannot even be typed into it, let alone parsed. That is a deliberate loss, taken with
 * the same shrug as hex rather than by oversight — do not describe it as relocated, and do not
 * reintroduce a text grammar in the byte field without asking, because the field would stop being
 * a number input (losing its spinner and its arrow-key increment) to get them back.
 *
 * One column's editor for a selection that may span several is deliberate, and it is not a
 * narrowing: a commit from a cell inside the marquee goes through `commitToCells`, which fans it
 * across **every** selected column and drops it from the ones whose shape it does not fit. So a
 * Dimmer + Colour marquee opens the dimmer's slider and moving it sets the dimmers, exactly as
 * `127` did — and the colours are left alone, exactly as they were.
 */

/**
 * The selected cells in the order the operator sees them: by displayed row, and within a row by
 * visible column.
 *
 * The caller takes the **first one that has an editor**, which is why this hands back the whole
 * order rather than just the winner. A marquee is geometric — `hitsFor` sweeps a rectangle over
 * rows and column bands — so it happily covers a Colour cell on a dimmer-only par, and opening
 * "the first selected cell" flatly would leave Enter doing nothing at all on a perfectly ordinary
 * selection. Which columns a row resolves is `buildRowCells`' answer and needs the rows, so it is
 * the container's half rather than this one's.
 *
 * The ordering itself is deliberately the same rule `singleColumnAnchor` applies to a released
 * drag — the first cell in display order — extended to the column axis, which that one never needs
 * (its cells are all in one column by definition). [rowOrder] and [columnOrder] are as displayed;
 * a selected cell that is filtered out or in a hidden column ranks last rather than being dropped,
 * so a selection made entirely of such cells is still offered rather than silently empty.
 */
export function orderedSelectedCells(
  cells: readonly CellRef[],
  rowOrder: readonly RowId[],
  columnOrder: readonly ColumnKey[],
): CellRef[] {
  const rowRank = new Map(rowOrder.map((id, index) => [id, index]))
  const colRank = new Map(columnOrder.map((col, index) => [col, index]))
  const rank = (cell: CellRef): [number, number] => [
    rowRank.get(cell.rowId) ?? Infinity,
    colRank.get(cell.col) ?? Infinity,
  ]
  return [...cells].sort((a, b) => {
    const [aRow, aCol] = rank(a)
    const [bRow, bCol] = rank(b)
    return aRow - bRow || aCol - bCol
  })
}

/** Which of the marquee's two keyboard gestures the current scope may take. */
export interface CellKeyboardPermission {
  /** Enter / a character: the cell's own editor is opened over the selection and its commit taken. */
  entry: boolean
  /** Backspace / Delete: the selected cells are taken out of Local. */
  clear: boolean
}

/**
 * The scope gate for the marquee's keyboard — the fourth place "read-only" has to be said.
 *
 * The marquee itself arms in every scope (its `pointerdown` sits on the rows wrapper, and a
 * read-only cell's `pointer-events-none` only retargets the press there), so the keyboard cannot
 * rely on there being no cells to type at. And `useCellWriters` has no arm for Output or for a focused
 * *template* layer — `ProgrammerGrid` supplies a `live` context for both — so a commit taken in
 * either would put literals into Local under a grid drawing itself as a read. That is the hole
 * `PropertyCell`'s `disabled` and `FanPopover`'s template gate each close for their own path, and
 * this closes it for the keyboard.
 *
 *  - **Local**, or no scope at all (the two plain list routes, which never have a marquee): both.
 *  - **Output**: neither. It is a read of the cook.
 *  - **A focused Look layer**: entry only. A value typed there lands in the row draft the way a
 *    cell edit does; Backspace does not, because the draft has no removal (`LookRowStore` exposes
 *    `setValue` alone), and a key that silently does nothing is worse than one withheld.
 *  - **A focused template layer**: neither. A template layer is a read, never an edit.
 */
export function cellKeyboardPermission(
  scope: ProgrammerScope | null,
  focusedTemplate: boolean,
): CellKeyboardPermission {
  if (scope == null || scope.kind === 'local') return { entry: true, clear: true }
  if (scope.kind === 'output') return { entry: false, clear: false }
  return focusedTemplate ? { entry: false, clear: false } : { entry: true, clear: false }
}

/**
 * Is a keystroke's target a cell the live marquee already covers?
 *
 * The DOM half of the grid's "not from a focused control" guard, and the reason it needs a half at
 * all. A cell trigger is a `<button>`, so a bare `closest('button')` test calls it someone else's
 * control — and after a marquee drag it is *exactly* where the focus is: the press focuses the
 * button under it, and the editor `PD-POPUP-AFTER-DRAG` auto-opens hands focus back to that button
 * when it closes. Every arm of the marquee keyboard then fell through from there, Enter to the
 * button's own default activation — which opens *that* cell's editor with nothing focused, rather
 * than the first selected cell's with its first field focused and waiting.
 *
 * The exemption is exactly as wide as the marquee and no wider, which is what keeps the rest of
 * the guard intact: a checkbox, a chip and a menu item are not inside a cell at all; a cell
 * *outside* the selection, tabbed to while one is live, is still its own editor's trigger; and
 * with no cells selected the caller never asks, so plain Tab-then-Enter is untouched.
 *
 * **It claims any control inside a covered cell, not the editor trigger specifically**, and that
 * is a deliberate width rather than an oversight: all four cell editors are Popover triggers
 * today, but naming the trigger — by `data-slot`, or by "the only button here" — would make this
 * exemption lapse silently the day one of them became a Select or a Dialog, which is the very
 * defect it exists to fix. The cost is the other direction: the grid's *second* in-cell control,
 * `OwnerJumpOverlay` (`FixturesTable.tsx`), would have its Enter and Backspace taken by the
 * marquee too. It does not today, because it renders only in Output scope, where
 * `cellKeyboardPermission` refuses both keys — so **a third in-cell control added in an editable
 * scope needs its own answer here**, and that is the check to make rather than a narrower
 * predicate now.
 *
 * Reads `data-cell` and `data-row-id`, the grid's addressing contract — the same two attributes
 * `FixturesTable` hangs on its rows and cells, and the same pair `orderedSelectedCells` above names
 * a cell by. Rename either and this has to move with it.
 */
export function marqueeOwnsKeyTarget(
  target: EventTarget | null,
  isCellSelected: (rowId: RowId, col: ColumnKey) => boolean,
): boolean {
  if (!(target instanceof HTMLElement)) return false
  const cell = target.closest<HTMLElement>('[data-cell]')
  const col = cell?.dataset.cell
  const rowId = cell?.closest<HTMLElement>('[data-row-id]')?.dataset.rowId
  if (col == null || rowId == null) return false
  return isCellSelected(rowId, col as ColumnKey)
}

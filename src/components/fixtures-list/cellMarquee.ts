import type { ColumnKey } from './columns'
import type { CellRef } from './cellSelectionModel'
import type { RowId } from './rowModel'

/** One column's horizontal extent, measured from the sticky header. */
export interface ColumnBand {
  col: ColumnKey
  left: number
  right: number
}

/** A rectangle in the scroller's client coordinates. */
export interface MarqueeRect {
  left: number
  top: number
  right: number
  bottom: number
}

/** Normalise a drag into a rectangle, so dragging up-left works like dragging down-right. */
export function rectFrom(
  start: { x: number; y: number },
  end: { x: number; y: number },
): MarqueeRect {
  return {
    left: Math.min(start.x, end.x),
    right: Math.max(start.x, end.x),
    top: Math.min(start.y, end.y),
    bottom: Math.max(start.y, end.y),
  }
}

/**
 * Which row indices a rectangle covers.
 *
 * Arithmetic rather than DOM hit-testing, because the table is virtualized: rows outside the
 * viewport have no element to test, so a marquee that scrolled past them would silently miss every
 * one. Every virtual item — dividers included — gets the identical `rowHeight` box, which is what
 * makes the arithmetic exact rather than approximate.
 *
 * `top`/`bottom` are client coordinates relative to the scroller; `scrollTop` and `headerHeight`
 * convert them into content space. Returns an inclusive `[first, last]`, or `null` when the
 * rectangle covers no row at all.
 */
export function rowIndexRange(
  rect: Pick<MarqueeRect, 'top' | 'bottom'>,
  {
    scrollTop,
    headerHeight,
    rowHeight,
    rowCount,
  }: { scrollTop: number; headerHeight: number; rowHeight: number; rowCount: number },
): [number, number] | null {
  if (rowCount === 0 || rowHeight <= 0) return null
  const toContent = (y: number) => y + scrollTop - headerHeight
  const first = Math.floor(toContent(rect.top) / rowHeight)
  // Strict overlap at the bottom edge, matching `columnRange`: a rectangle ending exactly on a row
  // boundary covers zero pixels of the row below and must not select it. `Math.max` keeps a
  // degenerate (zero-height) rect meaning "the row under the pointer" rather than nothing.
  const last = Math.max(first, Math.ceil(toContent(rect.bottom) / rowHeight) - 1)
  // Wholly above the first row, or wholly below the last: a drag that started in the header or in
  // the empty space under a short list selects nothing rather than clamping onto an edge row.
  if (last < 0 || first > rowCount - 1) return null
  return [Math.max(0, first), Math.min(rowCount - 1, last)]
}

/**
 * Which columns a rectangle overlaps.
 *
 * The bands are **measured** from the header rather than recomputed from the grid template. That
 * template is `min(45vw, 260px) repeat(N, minmax(96px, 1fr))`, and re-implementing that `min()` and
 * that `1fr` distribution in JS would be a second source of truth that drifts the first time a
 * column width changes. Measuring is also automatically right under horizontal scroll.
 *
 * Overlap is strict: a rectangle that merely touches a band's edge does not select it, so a drag
 * that starts exactly on a boundary picks one column rather than two.
 */
export function columnRange(
  rect: Pick<MarqueeRect, 'left' | 'right'>,
  bands: readonly ColumnBand[],
): ColumnKey[] {
  return bands.filter((b) => b.left < rect.right && b.right > rect.left).map((b) => b.col)
}

/**
 * The cell a completed marquee should open its editor at, or null when there is no one editor to
 * open.
 *
 * A drag has already said what the operator wants to edit, so making them click a cell afterwards
 * is a second gesture for a decision already made (`PD-POPUP-AFTER-DRAG`). The condition is the
 * selection sitting inside **one column**: the four cell editors encode value shape, so a
 * selection spanning Dimmer and Colour has no single editor to open. That is only about which
 * editor to *show* — a commit from whichever one opens still reaches every selected cell, because
 * `commitToCells` groups by column and `planBatchWrites` drops the columns the value does not fit.
 *
 * **It takes the whole accumulated selection, not the drag's own hits**, and the difference is a
 * ⌘-drag: `applyCellSelection` unions a `toggle` or `range-add` drag into what was already there,
 * so a second rectangle drawn over another column leaves a genuinely two-column selection while
 * that rectangle's own hits are one column. Asking the rectangle would open an editor for one of
 * the operator's two attributes and silently ignore the other.
 *
 * [rowOrder] is the rows as displayed, and the anchor is the selected cell in the **first** of
 * them — deliberately the same rule `openEntry` applies for the typed-value editor, so Enter and a
 * released drag open in the same place. Reading `cells[0]` instead would anchor at whichever block
 * the operator drew last.
 */
export function singleColumnAnchor(
  cells: readonly CellRef[],
  rowOrder: readonly RowId[],
): CellRef | null {
  const first = cells[0]
  if (!first) return null
  if (!cells.every((cell) => cell.col === first.col)) return null
  const rank = new Map(rowOrder.map((id, index) => [id, index]))
  let best = first
  // `Infinity` for a row that is not on display at all, so a selected-but-filtered-out cell never
  // wins the anchor — and so a selection of nothing but such cells still falls back to `cells[0]`
  // rather than to null.
  let bestRank = rank.get(first.rowId) ?? Infinity
  for (const cell of cells) {
    const candidate = rank.get(cell.rowId) ?? Infinity
    if (candidate < bestRank) {
      best = cell
      bestRank = candidate
    }
  }
  return best
}

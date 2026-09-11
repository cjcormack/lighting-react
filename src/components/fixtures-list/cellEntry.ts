import type { ColumnKey } from './columns'
import type { CellCommit, RowId } from './rowModel'
import type { ProgrammerScope } from '../programmer/ProgrammerScope'

/**
 * The grammar of a value typed at a cell selection — the keyboard half of the marquee.
 *
 * The gesture is spreadsheet-shaped: select cells, press Enter (or just start typing), type a
 * value, press Enter, and the value lands on every selected cell through the same
 * `planBatchWrites` path a popover commit takes. That shared path is what keeps this small: the
 * text becomes **one** `CellCommit`, and `commitMatchesResolution` inside `planBatchWrites` drops
 * it from any column it does not fit — so `127` typed at a marquee spanning Dimmer and Colour sets
 * the dimmers and leaves the colours alone, exactly as a slider drag from a dimmer cell would.
 *
 * What the text can be, in the order it is tried:
 *
 *  - **A colour**: `#f80`, `#ff8800`, `ff8800` (bare only with a letter in it, so `127` stays a
 *    level), or `r,g,b` (three 0–255 components). No extended
 *    emitter — the live writer fills white/amber/UV from the wire for a head that has them, as it
 *    does for Fan, and the Look writer elides them.
 *  - **A position**: `pan,tilt` (two numbers). Either may be blank — `,128` nudges tilt alone,
 *    `64,` pan alone — because a position commit is per-axis and a blank is "leave it".
 *  - **A level**: `127` (raw, the same 0–255 the popover's number field takes), `50%` (of 255,
 *    matching the cell's own readout), or the two words a lighting operator types without
 *    thinking, `full` and `out`.
 *
 * Deliberately **no setting grammar**: a setting's levels are option names, not numbers, and typing
 * `127` at a gobo wheel would land on whichever option's byte range that happens to fall in. The
 * picker is the right editor for one. A number typed at a marquee that includes a setting column
 * simply misses it, and the hint says which columns will take what.
 *
 * Returns null for anything it cannot read, and the field shows that rather than guessing —
 * `Number('')` is 0, and a blank Enter that blacked out the selection is the bug the popover's own
 * number field already guards against.
 */
export function parseCellEntry(raw: string): CellCommit | null {
  const text = raw.trim()
  if (text === '') return null

  const word = text.toLowerCase()
  if (word === 'full') return { kind: 'slider', value: 255 }
  if (word === 'out') return { kind: 'slider', value: 0 }

  // With the hash, three or six hex digits. Without it, six with at least one letter: `127` is a
  // level and `112233` a level typed with a slipped finger, and a form that read either as a colour
  // would turn the commonest thing an operator types into the wrong shape.
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text) ?? /^((?=.*[a-f])[0-9a-f]{6})$/i.exec(text)
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1]
    return {
      kind: 'colour',
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
    }
  }

  if (text.includes(',')) {
    const parts = text.split(',').map((p) => p.trim())
    if (parts.length === 3) {
      const rgb = parts.map(parseByte)
      if (rgb.every((n) => n != null)) {
        return { kind: 'colour', r: rgb[0]!, g: rgb[1]!, b: rgb[2]! }
      }
      return null
    }
    if (parts.length === 2) {
      const pan = parts[0] === '' ? undefined : parseByte(parts[0])
      const tilt = parts[1] === '' ? undefined : parseByte(parts[1])
      // A bare comma names no axis; a non-number on either side is a typo, not a blank.
      if (pan === undefined && tilt === undefined) return null
      if (pan === null || tilt === null) return null
      return { kind: 'position', pan, tilt }
    }
    return null
  }

  const pct = /^(\d+(?:\.\d+)?)\s*%$/.exec(text)
  if (pct) {
    const n = Number(pct[1])
    if (!Number.isFinite(n)) return null
    // `n * 2.55` is 127.49999… for 50 in binary floating point; scale by the integers instead.
    return { kind: 'slider', value: Math.round((Math.max(0, Math.min(100, n)) * 255) / 100) }
  }

  const level = parseByte(text)
  return level == null ? null : { kind: 'slider', value: level }
}

/** A non-negative integer or decimal, or null. Clamping to the target's range is `planBatchWrites`' job. */
function parseByte(text: string): number | null {
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null
  const n = Number(text)
  return Number.isFinite(n) ? Math.round(n) : null
}

/** Which of the marquee's two keyboard gestures the current scope may take. */
export interface CellKeyboardPermission {
  /** Enter / a digit: the typed-value field is offered and its commit is taken. */
  entry: boolean
  /** Backspace / Delete: the selected cells are taken out of Local. */
  clear: boolean
}

/**
 * The scope gate for the marquee's keyboard — the fourth place "read-only" has to be said.
 *
 * The marquee itself arms in every scope (its `pointerdown` sits on the rows wrapper, and a
 * read-only cell's `pointer-events-none` only retargets the press there), so the field cannot rely
 * on there being no cells to type at. And `useCellWriters` has no arm for Output or for a focused
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
 * What the field accepts, for the columns the marquee covers — its placeholder.
 *
 * Says what will *take* rather than listing the whole grammar: an operator with five dimmer cells
 * selected wants `127 · 50% · full`, not a paragraph. Columns whose values have no typed form
 * (the wheels) are named as such, so a number that lands nowhere is explained before it is typed.
 */
export function cellEntryHint(cols: readonly ColumnKey[]): string {
  const parts: string[] = []
  const kinds = new Set(cols.map(entryKindOf))
  if (kinds.has('level')) parts.push('127 · 50% · full')
  if (kinds.has('colour')) parts.push('#ff8800 · r,g,b')
  if (kinds.has('position')) parts.push('pan,tilt')
  if (kinds.has('wheel')) parts.push('127 (a wheel takes the picker)')
  return parts.join('   ')
}

/**
 * Which grammar a column's cells read, by column rather than by resolution: the marquee knows its
 * columns before any row's descriptors are in hand, and the placeholder must not wait for them.
 * Gobo and Prism resolve to a slider on one fixture and a wheel on the next, so they are named as
 * both; a colour *wheel* under the Colour column resolves as a setting and is caught at commit time
 * by `commitMatchesResolution`. The hint is at worst optimistic for a head, never wrong about the
 * column.
 */
function entryKindOf(col: ColumnKey): 'level' | 'colour' | 'position' | 'wheel' {
  switch (col) {
    case 'colour':
      return 'colour'
    case 'position':
      return 'position'
    case 'gobo':
    case 'prism':
      return 'wheel'
    default:
      return 'level'
  }
}

/**
 * Is a keystroke's target a cell the live marquee already covers?
 *
 * The DOM half of the grid's "not from a focused control" guard, and the reason it needs a half at
 * all. A cell trigger is a `<button>`, so a bare `closest('button')` test calls it someone else's
 * control — and after a marquee drag it is *exactly* where the focus is: the press focuses the
 * button under it, and the editor `PD-POPUP-AFTER-DRAG` auto-opens hands focus back to that button
 * when it closes. Every arm of the marquee keyboard then fell through from there, Enter to the
 * button's own default activation, which re-opened that one cell's editor with its field unfocused
 * instead of the typed-value field the selection bar promises.
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
 * Reads `data-cell` and `data-row-id` — the same two attributes `openEntry` finds the popover's
 * anchor by, walked the other way. Two hand-rolled traversals of one addressing contract, kept in
 * step by this sentence: rename either attribute and both have to move, and the forward half is
 * the `document.querySelector` in `FixturesListContainer`'s `openEntry`.
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

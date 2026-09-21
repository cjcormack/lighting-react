import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { ChevronUp } from 'lucide-react'
import { setBuskFocus, setBuskRigRows } from '@/lib/buskWindow'
import { cn } from '@/lib/utils'

/**
 * The rig's **handle** — one grip in two shapes (busk-further plan D6, revised 2026-09-21 three times).
 *
 * In **Split** it is a drag: the rows above it are clipped at the pointer while it is held, and on
 * release the band snaps to whole lines — a half line of tiles is useless — writing the window's
 * `busk.rigRows`. Dragged **past the last line, or to the bottom of the column** — whichever comes
 * first — it lands on Rig focus; dragged **above the first line's middle** it lands on Pads; so the
 * handle and the Focus control are one setting and the grip is never stuck at either end. The
 * floor rule is the one the first version lacked: on a rig taller than the window the last line's
 * bottom is below the viewport, so "past the last line" was unreachable and Rig could only be
 * reached from the segmented control — reported from the desk as the snap working upward only. There is deliberately **no count beside it**: the first
 * version captioned it *1 of 2 rows*, which said nothing the rows themselves did not, and made the
 * snap to Pads or Rig a caption change the eye missed. A second version drew a badge over the rows
 * naming the shape; the desk's verdict was that it still read as a status box rather than as the
 * band moving. So **the clip itself is the snap**: dragged into the Pads region the rows clip to
 * nothing and the band is already the shape Pads gives it; dragged into the Rig region the clip
 * lifts and **the band takes the page's room** — the rows stretch down to where the page body
 * ends, which is the height Rig gives them. Between the ends the rows' bottom edge **follows the
 * pointer** both ways: cut at it above the last line, extended to it below, so dragging past the
 * tiles visibly pushes the page down rather than doing nothing until an invisible threshold. The
 * arrow keys step it one line at a time and past both ends, for the keyboard.
 *
 * In **Rig** the way back is drawn where the drag handle would be — under the rows at the bottom
 * of the band — as a **chevron pill**, not the bar: the bar reads as something to drag, and this
 * is a press, so it says so with a glyph pointing the way the page will come. It had a twin in
 * Pads, under the band's one row, until busk-chrome plan D17 took the rig row out of Pads on the
 * desk board: there the Focus control is on the pad row, and that is the way back.
 *
 * `snapRigRows` is the pure rule, pinned by table in `RigBand.test.tsx`.
 */

/** How far past the last line's bottom the pointer must be dragged before the drop is Rig focus. */
const HANDLE_RIG_SLACK_PX = 24
/** A line counts as shown once the pointer is within this of its bottom: a near miss is a hit. */
const HANDLE_SNAP_SLACK_PX = 12
/** Within this of the column's bottom the drop is Rig focus, however tall the rig — the floor rule. */
const HANDLE_FLOOR_SLACK_PX = 40

/**
 * Where a drag at `y` would land, from the rendered lines' bottoms: `0` is Pads (above the first
 * line's middle), `total + 1` is Rig (well past the last line's bottom, **or** within
 * `HANDLE_FLOOR_SLACK_PX` of `floor` — the bottom of the column the band and the page share, so a
 * rig too tall for the window still reaches Rig at the bottom of the screen), and 1…total is that
 * many whole lines. Pure over the measurements so a test can feed it a table.
 */
export function snapRigRows(
  y: number,
  lineBoxes: readonly { top: number; bottom: number }[],
  total: number,
  floor?: number,
): number {
  if (lineBoxes.length === 0) return 0
  const first = lineBoxes[0]
  if (y < first.top + (first.bottom - first.top) / 2) return 0
  if (floor != null && y > floor - HANDLE_FLOOR_SLACK_PX) return total + 1
  const last = lineBoxes[lineBoxes.length - 1]
  if (y > last.bottom + HANDLE_RIG_SLACK_PX) return total + 1
  const shown = lineBoxes.filter((line) => line.bottom <= y + HANDLE_SNAP_SLACK_PX).length
  return Math.max(1, Math.min(total, shown))
}

/** Apply a handle position: Pads below the first line, Rig past the last, else that many lines. */
export function applyRigRows(snapped: number, total: number): void {
  if (snapped <= 0) setBuskFocus('pads')
  else if (snapped > total) setBuskFocus('rig')
  else setBuskRigRows(snapped)
}

const GRIP_CLASS =
  'h-1.5 w-16 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50'

export interface RigHandleProps {
  /** Which shape the band is in — a drag in Split, a press back to Split in Rig. */
  mode: 'split' | 'rig'
  /** Lines shown (Split) — `aria-valuenow`. */
  shown: number
  /** Lines on the rig (`rigLines`), the unit the handle counts. */
  total: number
  /** The rows grid the drag clips and measures — Split only. */
  rowsRef?: RefObject<HTMLDivElement | null>
  /** A drag is in progress — held by the band, which draws every line while one is. */
  dragging?: boolean
  onDragging?: (dragging: boolean) => void
}

export function RigHandle({ mode, shown, total, rowsRef, dragging = false, onDragging }: RigHandleProps) {
  const pointerId = useRef<number | null>(null)

  /**
   * The clip, imperative, and **the snap made visible**: in the Pads region (`snapped` 0) the rows
   * clip to nothing; in the Rig region (`snapped > total`) the clip lifts and the rows stretch to
   * take the page body's room, the shape Rig gives them; and between them the rows' bottom edge is
   * the pointer's — cut at it above the tiles, extended to it below, so the page is pushed down as
   * the drag goes past the last line. `null` clears it all, which is also how a measurement sees
   * the rows at their natural height.
   */
  const clip = useCallback(
    (y: number | null, snapped?: number) => {
      const rows = rowsRef?.current
      if (rows == null) return
      if (y == null) {
        rows.style.maxHeight = ''
        rows.style.minHeight = ''
        rows.style.overflow = ''
        return
      }
      if (snapped != null && snapped > total) {
        // Every line, plus whatever the page body had: the band as Rig draws it. Measured with
        // the clip lifted, since `onMove` clears it before asking.
        const body = rows.closest('[data-busk-column]')?.querySelector('[data-busk-page-body]')
        const fill = rows.getBoundingClientRect().height + (body?.getBoundingClientRect().height ?? 0)
        rows.style.maxHeight = ''
        rows.style.minHeight = `${fill}px`
        rows.style.overflow = ''
        return
      }
      const height = snapped === 0 ? 0 : Math.max(0, y - rows.getBoundingClientRect().top)
      rows.style.maxHeight = `${height}px`
      rows.style.minHeight = `${height}px`
      rows.style.overflow = 'hidden'
    },
    [rowsRef, total],
  )

  /** The bottom of the column the band shares with the page — the floor the Rig snap reads. */
  const floor = useCallback((): number | undefined => {
    const column = rowsRef?.current?.closest('[data-busk-column]')
    return column?.getBoundingClientRect().bottom
  }, [rowsRef])

  /** The lines' boxes as rendered — every line is in the DOM while a drag runs. */
  const measure = useCallback((): { top: number; bottom: number }[] => {
    const root = rowsRef?.current
    if (root == null) return []
    const boxes = new Map<number, { top: number; bottom: number }>()
    for (const el of root.querySelectorAll<HTMLElement>('[data-rig-line]')) {
      const line = Number(el.dataset.rigLine)
      const rect = el.getBoundingClientRect()
      const box = boxes.get(line)
      if (box == null) boxes.set(line, { top: rect.top, bottom: rect.bottom })
      else boxes.set(line, { top: Math.min(box.top, rect.top), bottom: Math.max(box.bottom, rect.bottom) })
    }
    return [...boxes.entries()].sort((a, b) => a[0] - b[0]).map(([, box]) => box)
  }, [rowsRef])

  // The rest of the drag lives on the window, as every other drag on this desk does: the pointer
  // leaves a 6px grip on the first movement. `pointercancel` ends it as a release does, so a drag
  // the browser reclaims as a pan on a touchscreen cannot leave the band clipped for ever.
  useEffect(() => {
    if (!dragging || mode !== 'split') return
    const onMove = (e: PointerEvent) => {
      if (pointerId.current != null && e.pointerId !== pointerId.current) return
      // Measured with the clip lifted, so a rows grid clipped to nothing still reports its lines.
      clip(null)
      clip(e.clientY, snapRigRows(e.clientY, measure(), total, floor()))
    }
    const onUp = (e: PointerEvent) => {
      if (pointerId.current != null && e.pointerId !== pointerId.current) return
      clip(null)
      const snapped = snapRigRows(e.clientY, measure(), total, floor())
      pointerId.current = null
      onDragging?.(false)
      applyRigRows(snapped, total)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    // The teardown **cancels** a drag still in flight, not only the listeners: this runs when the
    // handle unmounts, but also when `mode` leaves `split` while the pointer is down — a
    // `focus: 'rig'` from another window or MIDI mid-drag — and the handle stays mounted for that
    // (it draws the way back). Without it the release is never seen, the rows keep a stale clip,
    // the band's `dragging` stays true, and the next press on the grip re-arms a phantom drag whose
    // next pointerup anywhere on the page writes the row count.
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (pointerId.current != null) {
        pointerId.current = null
        clip(null)
        onDragging?.(false)
      }
    }
  }, [dragging, mode, measure, clip, floor, onDragging, total])

  if (mode === 'rig') {
    // The way back: a chevron pill where the drag handle would be — a press, and drawn as one,
    // pointing the way the page will come.
    const title = 'Show the page again: Split'
    return (
      <div className="flex h-5 shrink-0 items-center justify-center">
        <button
          type="button"
          data-rig-rows-handle={mode}
          aria-label={title}
          title={title}
          onClick={() => setBuskFocus('split')}
          className="flex h-4 w-16 cursor-pointer items-center justify-center rounded-full border bg-card text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronUp className="size-3" strokeWidth={2.5} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-4 shrink-0 items-center justify-center">
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Rig rows"
        aria-valuemin={0}
        aria-valuemax={total + 1}
        aria-valuenow={shown}
        tabIndex={0}
        data-rig-rows-handle="split"
        data-rig-rows-dragging={dragging ? 'true' : undefined}
        title="Drag to show more or fewer rows — it snaps to whole rows; past the last, or to the bottom, is Rig focus, above the first is Pads"
        className={cn(
          GRIP_CLASS,
          'cursor-row-resize touch-none',
          dragging ? 'bg-primary' : 'bg-border hover:bg-muted-foreground/70',
        )}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          // Captured, so a drag that runs off the bottom of the window — the Rig end is at the
          // bottom of the screen — keeps reporting and still delivers its release.
          if (typeof e.currentTarget.setPointerCapture === 'function') e.currentTarget.setPointerCapture(e.pointerId)
          pointerId.current = e.pointerId
          onDragging?.(true)
          clip(e.clientY)
        }}
        onKeyDown={(e) => {
          // One line at a time, and past both ends into Rig and Pads — the buttons the handle
          // replaced, on the keys.
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            e.preventDefault()
            applyRigRows(shown + 1, total)
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault()
            applyRigRows(shown - 1, total)
          }
        }}
      />
    </div>
  )
}

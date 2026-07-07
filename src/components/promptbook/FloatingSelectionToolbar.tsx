import { createPortal } from 'react-dom'
import { Highlighter, Scissors, StickyNote } from 'lucide-react'
import { clamp } from '@/lib/utils'

interface FloatingSelectionToolbarProps {
  /** Client-space top-centre of the current selection; the bar floats just above it. */
  anchor: { x: number; y: number }
  onAnchor: () => void
  onCut: () => void
  onNote: () => void
}

/**
 * A small action bar that floats above a live text selection in edit mode. It is
 * the annotation-creation surface: select the script text, then choose what it
 * becomes. "Anchor cue" opens a picker to choose which cue the selection belongs
 * to (anchoring a new cue or re-anchoring an existing one).
 *
 * Rendered through a portal with fixed positioning so page transforms / the scroll
 * container can't clip it. `onMouseDown` is prevented on the bar so clicking a
 * button doesn't collapse the selection before its handler runs.
 */
export function FloatingSelectionToolbar({ anchor, onAnchor, onCut, onNote }: FloatingSelectionToolbarProps) {
  const left = clamp(anchor.x, 96, window.innerWidth - 96)
  const top = Math.max(anchor.y - 8, 44)
  const btn =
    'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold hover:bg-muted/70'
  return createPortal(
    <div
      role="toolbar"
      // Prevent the selection from collapsing before the button's click fires.
      // pointerdown covers touch (mousedown does not, so taps would otherwise lose
      // the selection and the action would silently no-op on tablets/phones).
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      style={{ position: 'fixed', top, left, transform: 'translate(-50%, -100%)', zIndex: 60 }}
      className="flex items-center gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
    >
      <button type="button" onClick={onAnchor} className={`${btn} text-amber-600`}>
        <Highlighter className="size-3.5" /> Anchor cue
      </button>
      <span className="mx-0.5 h-5 w-px bg-border" />
      <button type="button" onClick={onCut} className={`${btn} text-red-500`}>
        <Scissors className="size-3.5" /> Mark cut
      </button>
      <button type="button" onClick={onNote} className={`${btn} text-sky-500`}>
        <StickyNote className="size-3.5" /> Add note
      </button>
    </div>,
    document.body,
  )
}

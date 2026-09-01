import { useCallback, useMemo, useRef } from 'react'

/**
 * A press-and-hold gesture, as the busk view's pads have always drawn it.
 *
 * The rule is the one three components hand-rolled independently: a timer armed on `pointerdown`,
 * cancelled if the pointer travels more than a few pixels (so a drag over a scrolling pad grid is a
 * scroll, not a hold) or leaves the element, and a short press that fires {@link onPress} on
 * `pointerup` only when the hold did not.
 *
 * **The move threshold is why this is pointer events rather than `click`.** A pad grid scrolls, and
 * on a touchscreen every scroll begins as a press on whatever is under the finger; without the
 * threshold, dragging the library would fire a pad.
 *
 * {@link consumeLongPress} exists for the one case a pad does not have: handlers spread on a
 * *container* whose children are themselves buttons. Call it from the container's `onClickCapture`
 * and `stopPropagation()` when it returns true — capture runs root-to-child, so the child's own
 * `onClick` never sees the click that ended the hold. It is one-shot: the flag clears on read, and
 * again on the next `pointerdown`.
 *
 * `onLongPress` is handed **where the press started**, which is what lets a hold turn into a drag:
 * a hold-to-slide control seeds its value from the point the finger landed on, so the value does
 * not jump the moment the gesture arms. The hold fires while the pointer is still down, so a
 * consumer wanting the rest of the drag installs its own window listeners from there — this hook
 * deliberately does not own the drag, only the moment it begins.
 */
export interface PressOrigin {
  x: number
  y: number
}

export interface LongPressOptions {
  /**
   * Fired once the hold survives {@link delayMs}, while the pointer is still down, with the
   * viewport point the press started at.
   */
  onLongPress: (origin: PressOrigin) => void
  /** Fired on `pointerup` when the press was neither a hold nor a drag. */
  onPress?: () => void
  /** How long the hold must last. The busk view's pads have always used 500ms. */
  delayMs?: number
  /** How far the pointer may travel before the gesture becomes a drag and is abandoned. */
  moveThresholdPx?: number
  /** Arms nothing while true — used where a control underneath owns the pointer instead. */
  disabled?: boolean
}

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: () => void
  onPointerLeave: () => void
  onPointerCancel: () => void
}

export function useLongPress({
  onLongPress,
  onPress,
  delayMs = 500,
  moveThresholdPx = 10,
  disabled = false,
}: LongPressOptions): {
  handlers: LongPressHandlers
  consumeLongPress: () => boolean
} {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)
  const didMove = useRef(false)
  const startPos = useRef<{ x: number; y: number } | null>(null)

  // Read through refs so the returned handlers keep one identity for the life of the component:
  // they are spread onto an element, and a fresh object every render would defeat any memo above.
  const longPressRef = useRef(onLongPress)
  longPressRef.current = onLongPress
  const pressRef = useRef(onPress)
  pressRef.current = onPress
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const handlers = useMemo<LongPressHandlers>(
    () => ({
      onPointerDown: (e: React.PointerEvent) => {
        didLongPress.current = false
        didMove.current = false
        if (disabledRef.current) return
        startPos.current = { x: e.clientX, y: e.clientY }
        const origin = { x: e.clientX, y: e.clientY }
        timer.current = setTimeout(() => {
          timer.current = null
          didLongPress.current = true
          if (!didMove.current) longPressRef.current(origin)
        }, delayMs)
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!startPos.current || didMove.current) return
        const dx = e.clientX - startPos.current.x
        const dy = e.clientY - startPos.current.y
        if (dx * dx + dy * dy > moveThresholdPx * moveThresholdPx) {
          didMove.current = true
          cancel()
        }
      },
      onPointerUp: () => {
        cancel()
        if (!didLongPress.current && !didMove.current) pressRef.current?.()
        startPos.current = null
      },
      onPointerLeave: () => {
        cancel()
        startPos.current = null
      },
      // The browser taking the gesture over — a touch the scroller claims as a pan — ends it with
      // no `pointerup` at all. Without this the armed timer survives the touch and the hold fires
      // on a finger that is already scrolling something else.
      onPointerCancel: () => {
        cancel()
        startPos.current = null
      },
    }),
    [cancel, delayMs, moveThresholdPx],
  )

  const consumeLongPress = useCallback(() => {
    const fired = didLongPress.current
    didLongPress.current = false
    return fired
  }, [])

  return { handlers, consumeLongPress }
}

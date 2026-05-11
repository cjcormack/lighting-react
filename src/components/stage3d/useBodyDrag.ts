import { useCallback, useEffect, useRef } from 'react'
import { type ThreeEvent } from '@react-three/fiber'
import { useHandleDrag, type StartDragOptions } from './useHandleDrag'

const DRAG_PX_THRESHOLD = 4

export interface UseBodyDragOpts {
  /** Fired on pointerup if the pointer never crossed the click/drag threshold. */
  onClick?: () => void
  /** Factory for the drag options forwarded to useHandleDrag on promotion.
   *  Returning undefined disables drag (caller can omit instead). */
  buildDrag?: () => StartDragOptions
  /** Eagerly fired on pointerdown when drag is possible. Use this to disable
   *  OrbitControls so a sub-threshold pointermove doesn't trigger camera
   *  rotation that has to snap back on promote. */
  onDragStart?: () => void
  /** Fires exactly once on completion — on the dragged onSettle OR on the
   *  pointerup-as-click branch. Use to re-enable OrbitControls. */
  onDragEnd?: () => void
}

/**
 * Click-vs-drag discriminator for "the body is the affordance" interactions.
 * Watches a 4 px movement threshold from pointerdown; below threshold on
 * pointerup is a click, at or above is a drag promoted to useHandleDrag.
 * Window listeners survive cursor leaving the canvas and are torn down on
 * cleanup, promotion, or component unmount mid-discrimination.
 */
export function useBodyDrag() {
  const startDrag = useHandleDrag()
  const activeCleanup = useRef<(() => void) | null>(null)

  useEffect(
    () => () => {
      activeCleanup.current?.()
      activeCleanup.current = null
    },
    [],
  )

  return useCallback(
    (e: ThreeEvent<PointerEvent>, opts: UseBodyDragOpts) => {
      if (e.button !== 0) return
      if (!opts.onClick && !opts.buildDrag) return
      e.stopPropagation()

      const pointerId = e.pointerId
      const downX = e.nativeEvent.clientX
      const downY = e.nativeEvent.clientY
      const canDrag = !!opts.buildDrag
      let promoted = false

      if (canDrag) opts.onDragStart?.()

      const cleanup = () => {
        window.removeEventListener('pointermove', onWindowMove)
        window.removeEventListener('pointerup', onWindowUp)
        window.removeEventListener('pointercancel', onWindowUp)
        activeCleanup.current = null
      }

      const onWindowMove = (ev: PointerEvent) => {
        if (promoted || ev.pointerId !== pointerId) return
        const dx = ev.clientX - downX
        const dy = ev.clientY - downY
        if (Math.hypot(dx, dy) < DRAG_PX_THRESHOLD) return
        promoted = true
        cleanup()
        const dragOpts = opts.buildDrag?.()
        if (!dragOpts) return
        startDrag(
          {
            ...dragOpts,
            onSettle: (last) => {
              opts.onDragEnd?.()
              dragOpts.onSettle(last)
            },
          },
          e,
        )
      }

      const onWindowUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return
        cleanup()
        if (promoted) return
        if (canDrag) opts.onDragEnd?.()
        opts.onClick?.()
      }

      activeCleanup.current = cleanup
      window.addEventListener('pointermove', onWindowMove)
      window.addEventListener('pointerup', onWindowUp)
      window.addEventListener('pointercancel', onWindowUp)
    },
    [startDrag],
  )
}

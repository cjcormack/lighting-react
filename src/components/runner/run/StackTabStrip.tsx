import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CueStack } from '@/api/cueStacksApi'

/** How much of the visible width a chevron press moves. */
const PAGE_FRACTION = 0.8

/**
 * The Run view's stack switcher: one tab per runnable stack, separators drawn inline.
 *
 * Lifted out of `RunPage` to give it the two things it was missing, both of which matter most on
 * exactly the shows that have enough stacks to overflow:
 *
 *  - **The active tab is scrolled into view.** `activeStackId` can change from the *server* — a
 *    second desk, a surface, a script — and before this the strip would silently select a tab that
 *    was off the right-hand edge, so the operator saw no change at all. `behavior: 'auto'` rather
 *    than smooth: mid-show a determinate jump beats an animation, and `inline: 'nearest'` already
 *    no-ops when the tab is fully visible.
 *  - **An overflow affordance.** Every child is `shrink-0` and a tab runs 110-160px, so eight
 *    stacks overflow a 900px strip with nothing whatsoever saying so.
 *
 * Deliberately not `role="tablist"`: these buttons move the server's playhead, they do not reveal
 * a local panel. And deliberately no scroll-snap — it fights the programmatic `scrollIntoView`
 * above, and the items are variable-width so it would land off-centre anyway.
 *
 * Renders nothing for a single-stack show; the ShowBar carries the stack name in that case.
 */
export function StackTabStrip({
  stacks,
  activeStackId,
  runnableStackCount,
  onSwitchToStack,
}: {
  stacks: CueStack[]
  activeStackId: number | null
  runnableStackCount: number
  onSwitchToStack: (stack: CueStack) => void
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })

  const measure = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    setOverflow({
      // A sub-pixel slack: fractional layout widths otherwise leave a chevron permanently lit.
      left: el.scrollLeft > 1,
      right: el.scrollLeft < maxScroll - 1,
    })
  }, [])

  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [measure, stacks])

  // Reveal the active tab, including when the *server* moved it.
  useEffect(() => {
    if (activeStackId == null) return
    const el = scrollerRef.current?.querySelector(`[data-stack-id="${activeStackId}"]`)
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'auto' })
  }, [activeStackId])

  const page = (direction: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * PAGE_FRACTION, behavior: 'smooth' })
  }

  if (runnableStackCount <= 1) return null

  return (
    <div className="relative flex h-12 shrink-0 items-stretch border-b">
      <div
        ref={scrollerRef}
        onScroll={measure}
        aria-label="Stack tabs"
        className="flex flex-1 items-stretch overflow-x-auto"
      >
        {stacks.map((s) => {
          if (s.type === 'SEPARATOR') {
            return (
              <div
                key={s.id}
                className="flex items-center h-full px-2 gap-1.5 shrink-0 pointer-events-none"
              >
                <div className="w-px h-4 bg-border" />
                <span className="text-xs font-medium uppercase text-muted-foreground whitespace-nowrap">
                  {s.label ?? s.name}
                </span>
                <div className="w-px h-4 bg-border" />
              </div>
            )
          }
          const standardCount = s.cues.filter((c) => c.cueType === 'STANDARD').length
          return (
            <Button
              key={s.id}
              data-stack-id={s.id}
              variant="ghost"
              onClick={() => onSwitchToStack(s)}
              className={cn(
                'flex items-center gap-2 px-5 h-full rounded-none border-r text-xs font-medium text-muted-foreground relative shrink-0',
                'hover:text-foreground hover:bg-muted/10',
                s.id === activeStackId &&
                  'text-foreground bg-muted/20 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary',
              )}
            >
              {s.id !== activeStackId && s.activeCueId != null && (
                <span className="size-1.5 rounded-full bg-green-500 shadow-[0_0_6px_currentColor]" />
              )}
              {s.name}
              {s.loop && <RotateCcw className="size-3 text-muted-foreground" />}
              <span className="font-mono text-[9.5px] rounded-full border bg-muted/40 px-1.5 text-muted-foreground/80 ml-0.5">
                {standardCount}
              </span>
            </Button>
          )
        })}
      </div>

      {/* Edge affordances — a fade so the cut-off tab reads as continuing, and a press target so
          it can be reached without a trackpad gesture. Both only while there is more that way. */}
      {overflow.left && <ScrollEdge side="left" onClick={() => page(-1)} />}
      {overflow.right && <ScrollEdge side="right" onClick={() => page(1)} />}
    </div>
  )
}

function ScrollEdge({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 w-10',
          side === 'left'
            ? 'left-0 bg-gradient-to-r from-background to-transparent'
            : 'right-0 bg-gradient-to-l from-background to-transparent',
        )}
      />
      <button
        type="button"
        onClick={onClick}
        aria-label={side === 'left' ? 'Scroll stacks left' : 'Scroll stacks right'}
        className={cn(
          'absolute inset-y-0 grid w-6 place-items-center text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground',
          side === 'left' ? 'left-0' : 'right-0',
        )}
      >
        <Icon className="size-4" />
      </button>
    </>
  )
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { usePersistentState } from '@/hooks/usePersistentState'
import { cn } from '@/lib/utils'

/** The rail's docked width, in px: the stored one is clamped into this range on every read. */
export const RAIL_MIN_WIDTH = 260
export const RAIL_MAX_WIDTH = 480
export const RAIL_DEFAULT_WIDTH = 300
// Three more numbers govern the rail and are deliberately NOT constants here: the 1200px dock
// breakpoint, the 704px bottom-sheet breakpoint and the overlay's 300px width. All three are
// container-query geometry, so they live as Tailwind literals — `@min-[1200px]:` /
// `@max-[1200px]:` and `@min-[704px]:` / `@max-[704px]:` on the frames below and on the per-arm
// controls in `ProgrammerRail`, and `@max-[1200px]:w-[300px]` on the body frame. A JS constant
// beside them would read as the authority while moving nothing; `grep 1200px` / `grep 704px` is
// how the arms are found, and `ProgrammerWorkspace.test.tsx` pins the class strings.

const WIDTH_KEY = 'programmer.rail.width'
const COLLAPSED_KEY = 'programmer.rail.collapsed'

/** A stored width is data: a value from an older build, or a hand edit, is clamped rather than trusted. */
export function clampRailWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return RAIL_DEFAULT_WIDTH
  return Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, Math.round(value)))
}

/**
 * The rail's state and the gestures on it, as `ProgrammerRail` reads them.
 *
 * `collapsed`, `overlayOpen` and `sheetOpen` are three facts, not one with three names, and only
 * one of them is ever *drawn* at a time: the docked arm reads `collapsed`, the overlay arm reads
 * `overlayOpen`, the phone arm reads `sheetOpen`. They are written by different controls too —
 * `collapse` / `expand` are offered only where the rail docks, `openOverlay` / `closeOverlay`
 * only where it overlays, `openSheet` / `closeSheet` only from the bottom handle — so closing an
 * overlay on an iPad never writes "collapsed" into the preference a wide desk will read tomorrow,
 * and a phone's bottom sheet writes no preference at all.
 *
 * `sheetOpen` belongs **here and not in `RailGeometry`**: it is a gesture, like the other two, and
 * the geometry context exists solely to keep the dragged width away from everything that reads an
 * arm.
 *
 * **The width is not in here.** It changes sixty times a second under a drag, and `ProgrammerRail`
 * reads this context at its top, above every layer row and every FX row; a width in this object
 * would re-render all of them per pointer move. The width and the drag live in `RailGeometry`,
 * which only `RailBodyFrame` reads — and that frame's children are elements the rail already
 * rendered, so a re-render of the frame reaches none of them.
 */
export interface RailArm {
  collapsed: boolean
  overlayOpen: boolean
  /** The phone arm's bottom sheet. Transient, and reachable only from the bottom handle. */
  sheetOpen: boolean
  collapse: () => void
  expand: () => void
  openOverlay: () => void
  closeOverlay: () => void
  openSheet: () => void
  closeSheet: () => void
}

/** The docked width and the drag that sets it. Read by the body frame alone — see `RailArm`. */
export interface RailGeometry {
  /** The docked width: the stored one, or the live one while the handle is being dragged. */
  width: number
  /** A drag on the handle is in progress. */
  resizing: boolean
  /** The handle's `onPointerDown`: the rest of the drag lives on `window`. */
  onResizeStart: (e: React.PointerEvent) => void
}

const RailArmContext = createContext<RailArm | null>(null)
const RailGeometryContext = createContext<RailGeometry | null>(null)

/** The rail's arm. Throws outside `ProgrammerWorkspace` — nothing else has a rail to read. */
export function useRailArm(): RailArm {
  const arm = useContext(RailArmContext)
  if (arm == null) throw new Error('useRailArm must be used inside <ProgrammerWorkspace>')
  return arm
}

function useRailGeometry(): RailGeometry {
  const geometry = useContext(RailGeometryContext)
  if (geometry == null) throw new Error('RailBodyFrame must be used inside <ProgrammerWorkspace>')
  return geometry
}

/**
 * The grid and the rail, on one screen.
 *
 * The point of the whole view: values, layers and effects were three tabs of a collapsed pane, so
 * the three readings of one live object could never be seen together, and editing values while
 * watching the layer stack that produced them was impossible by construction.
 *
 * **This component owns the rail's state, and it must stay here.** `programmer.rail.width`
 * (260–480, default 300) and `programmer.rail.collapsed` persist per desk; `overlayOpen` is
 * transient. All three are new pieces of state that sit *inside* `ProgrammerBody`'s memo barrier
 * — held above it, in `ProgrammerPage`, every ShowBar re-render would reach the grid again. The
 * `grid` and `rail` elements are created by `ProgrammerBody` and arrive here as props, so a state
 * change here re-renders this frame and nothing inside the grid. The rail reads two contexts, and
 * which one carries what is the reason there are two: `RailArm` (the flags) changes on a gesture
 * and may re-render the rail; `RailGeometry` (the width) changes per pointer move and reaches only
 * `RailBodyFrame`, whose children are the rail's already-rendered elements.
 *
 * **Three arms, by the workspace's own width** (space plan D6 and D8), all container queries on
 * the child of the `@container` wrapper — see the trap below:
 *
 * - **≥1200px, docked.** The rail sits beside the grid at the stored width, with a 5px handle on
 *   its left edge that sets it. Collapsed, it is a 40px strip carrying the two counts and a `+`.
 * - **≥1200px, collapsed.** The strip alone; the grid takes the rest.
 * - **704–1200px.** The strip always, and opening it mounts the rail as a 300px `absolute` overlay
 *   with a shadow over the grid's right edge, left of the strip. It closes from the strip's
 *   chevron, from its own header's chevron, on Escape, or on a press anywhere on the grid.
 * - **<704px — the phone.** The row turns into a column: the grid takes the whole width and the
 *   rail becomes a 44px **handle across the bottom**, which opens the same body in a
 *   `Sheet side="bottom"` at 80% height. A 300px overlay over a 393px screen is not an overlay,
 *   it is a takeover with a sliver of grid showing at its left, and the 40px right strip took an
 *   eighth of the value columns for two badges.
 *
 * **704px is the workspace's width, not the viewport's**, because that is what a container query
 * can ask. With the sidebar on its 64px rail — which is where D7 starts every live view — 704 of
 * workspace is a **768px viewport**, i.e. Tailwind's `md`, which is what the plan says. Below
 * `md` the sidebar is off-canvas and the workspace *is* the viewport, so on a phone the same
 * number is read directly: 393 and 852 land either side of it exactly as the `Phone` and
 * `PhoneLandscape` artboards do.
 *
 * The rail stays on the **right**: that keeps `FixturesTable`'s sticky name column against the
 * page edge, and it is the only side that can collapse without moving the grid.
 *
 * **The `@max-[900px]` stacking arm is gone, not kept beside the overlay.** It dropped the rail
 * *beneath* the grid, gave the grid a `min-h-[26rem]` floor and made the whole column the page
 * scroller. On an iPad in portrait that put the layers off the bottom of the screen behind a
 * floor of fixture rows, which is the defect D6 exists to remove — and keeping it as a fourth arm
 * would have meant two different answers to "where do the layers go on a narrow page", switching
 * at a width nobody would remember. The overlay answers it at every narrow width: the grid is the
 * scroller everywhere, the rail scrolls itself, and nothing is ever below the fold.
 *
 * **No padding and no gap**, since session 1. `p-4` and `gap-3` cost 16px of height, 32px of width
 * and a 12px trench down the middle of a page whose whole point is the grid. The seam between the
 * two columns is the rail's `border-l` — a line, not a gutter.
 *
 * **The `@container` is a wrapper, and the queried classes are on its children.** A container
 * query matches an element's *ancestor* containers, never the element that declares the
 * container, so `@max-[900px]:flex-col` on the same element as `@container` never fired — while
 * the rail's `@max-[900px]:w-full`, one level down, did. Below 900px that left the row direction
 * with a full-width rail in it: the grid was flexed to zero width, its toolbar and legend rendered
 * at min-content in a sliver at the left, and the rail painted over them. Found on a desk at a
 * narrow window, three sessions after it shipped. Every query here — the frames' arms, the strip's
 * per-arm chevrons — is on a descendant of the wrapper for that reason, and the rail declares no
 * `@container` of its own, so its queries measure the workspace and not the rail.
 *
 * **The drag ends on `pointercancel` exactly as on `pointerup`** — the busk speed rail's lesson.
 * On a touchscreen a drag the browser reclaims as a pan ends with no release at all, and a frame
 * left `resizing` would keep its window listeners and write a width on the next pointer movement
 * anywhere on the page with nothing held down. The live width is written by the pointer handlers
 * into a ref as well as state, never at render time: a fast drag can dispatch the last move and
 * the release inside one task, and a ref assigned during render would commit the width from the
 * move *before* last.
 */
export function ProgrammerWorkspace({ grid, rail }: { grid: ReactNode; rail: ReactNode }) {
  const [storedWidth, setStoredWidth] = usePersistentState<number>(WIDTH_KEY, RAIL_DEFAULT_WIDTH)
  const [collapsed, setCollapsed] = usePersistentState<boolean>(COLLAPSED_KEY, false)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  /** The width under the pointer while a drag runs; null when one is not. */
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const drag = useRef<{ startX: number; startWidth: number; width: number } | null>(null)
  const resizing = dragWidth != null
  const width = dragWidth ?? clampRailWidth(storedWidth)

  const onResizeStart = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      const startWidth = clampRailWidth(storedWidth)
      drag.current = { startX: e.clientX, startWidth, width: startWidth }
      setDragWidth(startWidth)
    },
    [storedWidth],
  )

  // The rest of the drag lives on the window: the pointer leaves a 5px handle on the first
  // movement, and the release very often happens over the grid. Keyed on `resizing`, the boolean,
  // never on the dragged width, or every move would tear the listeners down and rebuild them.
  useEffect(() => {
    if (!resizing) return
    const onMove = (e: PointerEvent) => {
      const current = drag.current
      if (!current) return
      // The rail is on the right, so dragging its left edge leftwards grows it.
      const next = clampRailWidth(current.startWidth + (current.startX - e.clientX))
      if (next === current.width) return
      current.width = next
      setDragWidth(next)
    }
    const onUp = () => {
      const final = drag.current?.width
      drag.current = null
      setDragWidth(null)
      // Committed once, on release, rather than per move: `usePersistentState` writes
      // localStorage on every change, and a drag is sixty of them a second.
      if (final != null) setStoredWidth(final)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [resizing, setStoredWidth])

  // Escape closes the overlay. `defaultPrevented` is how a sheet or a popover open above it says
  // it took the key: Radix's dismissable layer prevents the default on the Escape it handles, so
  // one press closes the sheet and leaves the rail, rather than both.
  useEffect(() => {
    if (!overlayOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setOverlayOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [overlayOpen])

  const arm = useMemo<RailArm>(
    () => ({
      collapsed,
      overlayOpen,
      sheetOpen,
      collapse: () => setCollapsed(true),
      expand: () => setCollapsed(false),
      openOverlay: () => setOverlayOpen(true),
      closeOverlay: () => setOverlayOpen(false),
      openSheet: () => setSheetOpen(true),
      closeSheet: () => setSheetOpen(false),
    }),
    [collapsed, overlayOpen, sheetOpen, setCollapsed],
  )
  const geometry = useMemo<RailGeometry>(
    () => ({ width, resizing, onResizeStart }),
    [width, resizing, onResizeStart],
  )

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      {/* `relative` is the overlay's containing block. `select-none` while resizing keeps the
          drag from painting a text selection across the grid it crosses. */}
      {/* `@max-[704px]:flex-col` is the whole of the phone arm's layout: the same two children,
          stacked, so the rail's strip frame lands *under* the grid as a full-width bar instead of
          beside it as a column. Nothing is hoisted, nothing is portalled, and the grid element
          never moves in the tree. */}
      <div
        className={cn(
          'relative flex min-h-0 flex-1 @max-[704px]:flex-col',
          resizing && 'cursor-col-resize select-none',
        )}
      >
        {/* Capture, not bubble: a press on a cell that stops propagation must still close the
            overlay, and the press itself goes on to land. In the wide arm `overlayOpen` is only
            ever stale-true, and clearing it there changes nothing on screen. */}
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          onPointerDownCapture={overlayOpen ? arm.closeOverlay : undefined}
        >
          {grid}
        </div>
        <RailArmContext.Provider value={arm}>
          <RailGeometryContext.Provider value={geometry}>{rail}</RailGeometryContext.Provider>
        </RailArmContext.Provider>
      </div>
    </div>
  )
}

/**
 * Where the rail body sits: docked at the stored width in the wide arm, an overlay over the grid
 * in the narrow one, hidden in each when its own flag says so. The geometry lives here, beside
 * the state that drives it; what goes *in* the frame is `ProgrammerRail`'s.
 *
 * The width reaches the docked arm through a CSS variable rather than an inline `width`, because
 * an inline width could be overridden by nothing — the narrow arm has to be able to set its own.
 *
 * Mounted by `ProgrammerRail` only while it can be seen in some arm (`!collapsed || overlayOpen`),
 * and not at all while the phone arm's sheet is open — that arm renders the same body inside the
 * sheet, and mounting it twice would be two layer lists, two FX lists and two subscriptions to
 * each. The one case that leaves it mounted and hidden — an arm where its own flag says show and
 * the container query says otherwise — is accepted: nothing in the rail owns a selection, and the
 * alternative is a JS measurement of the width the container query already answers.
 */
export function RailBodyFrame({ children }: { children: ReactNode }) {
  const arm = useRailArm()
  const { width, onResizeStart } = useRailGeometry()
  const style = { '--rail-w': `${width}px` } as CSSProperties
  return (
    <div
      role="complementary"
      aria-label="Layers and effects"
      style={style}
      className={cn(
        // An **opaque** fill, mixed from the card tint and the page background, rather than
        // `bg-card/40`: docked, a 40% tint over the page reads the same, but the overlay sits over
        // row B and the grid's column header, and a translucent rail let both bleed through it.
        'flex min-h-0 flex-col border-l bg-[color-mix(in_oklab,var(--card)_40%,var(--background))]',
        // ≥1200: beside the grid at the stored width, or gone when collapsed.
        '@min-[1200px]:relative @min-[1200px]:w-[var(--rail-w)] @min-[1200px]:shrink-0',
        arm.collapsed && '@min-[1200px]:hidden',
        // <1200: over the grid's right edge, left of the 40px strip, and gone unless opened.
        '@max-[1200px]:absolute @max-[1200px]:inset-y-0 @max-[1200px]:right-10 @max-[1200px]:z-20 @max-[1200px]:w-[300px] @max-[1200px]:shadow-[-12px_0_32px_rgba(0,0,0,0.55)]',
        !arm.overlayOpen && '@max-[1200px]:hidden',
        // <704: never here. The body is the bottom sheet's, and the sheet is a portal.
        '@max-[704px]:hidden',
      )}
    >
      {/* The 5px handle, straddling the border. Docked arm only: the overlay is not sized. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the rail"
        title="Drag to resize the rail"
        onPointerDown={onResizeStart}
        className="absolute inset-y-0 -left-[3px] z-10 w-[5px] cursor-col-resize touch-none hover:bg-primary/40 @max-[1200px]:hidden"
      />
      {children}
    </div>
  )
}

/**
 * The 40px strip: on screen whenever the body is not docked — collapsed in the docked arm, always
 * in the overlay one, and never on the phone, where the bottom handle takes its place.
 */
export function RailStripFrame({ children }: { children: ReactNode }) {
  const arm = useRailArm()
  return (
    <div
      className={cn(
        'flex w-10 shrink-0 flex-col items-center border-l bg-card/40',
        !arm.collapsed && '@min-[1200px]:hidden',
        '@max-[704px]:hidden',
      )}
    >
      {children}
    </div>
  )
}

/**
 * The phone arm's 44px handle, across the bottom of the page.
 *
 * A sibling frame rather than a mode of `RailStripFrame`, for the same reason the two chevrons
 * are two buttons: the arms are CSS, so both are always in the tree and each is hidden where it
 * does not belong. It is the row's *second* child either way — the row goes `flex-col` below
 * 704px, which is what puts this under the grid instead of beside it — so nothing about the
 * grid's position changes as the arm does.
 *
 * 44px, not the strip's 40: this one is a touch target rather than a column of glyphs.
 *
 * **It closes the sheet when it stops being drawn**, and that is not decoration. `sheetOpen` is
 * the one arm flag a stale `true` is not harmless for: `collapsed` and `overlayOpen` are read by
 * frames whose *arms are CSS*, so a stale one changes nothing on screen — but `ProgrammerRail`
 * picks the sheet with a JS ternary, so a sheet opened on a phone that is then rotated or resized
 * past 704px would keep covering 80% of a desktop layout **and** skip the docked frame, with the
 * only control that closes it hidden by the query above. (It is still dismissible — Escape, a
 * click outside, the sheet's own X — so this is a wrong picture, not a trap.)
 *
 * It watches **this element's own height**, not the workspace's width, and that is the point: the
 * 704 lives in exactly one place, the Tailwind class above, so there is no JS threshold beside it
 * to drift. Nor is it the width measurement the plan forbids — that rule is about *choosing* an
 * arm, and this reads the arm CSS has already chosen. `ResizeObserver` is guarded for jsdom, which
 * lays nothing out and would otherwise report every handle as hidden and close every sheet on
 * arrival.
 */
export function RailHandleFrame({ children }: { children: ReactNode }) {
  const arm = useRailArm()
  const ref = useRef<HTMLDivElement>(null)
  const { sheetOpen, closeSheet } = arm

  useEffect(() => {
    const el = ref.current
    if (!sheetOpen || !el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      // `display: none` reports a zero box, which is how the container query's answer reaches JS.
      if (el.getBoundingClientRect().height === 0) closeSheet()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [sheetOpen, closeSheet])

  return (
    <div
      ref={ref}
      className="flex h-11 shrink-0 items-center gap-2.5 border-t bg-card/40 px-3 @min-[704px]:hidden"
    >
      {children}
    </div>
  )
}

import { useCallback, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronRight, Gauge, Palette, Waves, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useCellEditorForm, type CellEditorForm } from '@/components/sheet/cells/CellEditorSurface'
import { CHROME_ROW_CLASS } from '@/components/sheet/sheetFrame'
import {
  SIDE_PANEL_BODY_CLASS,
  SIDE_PANEL_ENTER_CLASS,
  SIDE_PANEL_HEADER_BUTTON_CLASS,
  SIDE_PANEL_OVERLAY_CLASS,
  usePanelEnter,
  useSidePanelResize,
} from '@/components/sheet/sidePanel'
import { SidePanelResizeHandle } from '@/components/sheet/SidePanelResizeHandle'
import { SidePanelModeToggle } from '@/components/sheet/SidePanelModeToggle'
import { useSidePanelMode } from '@/lib/sidePanelMode'
import type { AttributeFamily } from '@/lib/attributeFamily'
import { LIVE_SHEET_TABS, setBuskSheet, useBuskSheet, type BuskSheetTab } from '@/lib/buskWindow'
import { cn } from '@/lib/utils'
import { BuskSpeedRail } from './BuskSpeedRail'
import { ColourSheet } from './ColourSheet'
import { SideSheetFold } from './SideSheetFold'
import { SpreadSheet, type SpreadSeed } from './SpreadSheet'
import type { BuskingTarget } from './buskingTypes'

/**
 * The busk view's **side sheet** — one rail, three tabs, one fold, one fact (busk-further plan
 * D7; `Sheets.dc.html` is the authority on layout).
 *
 * **Speed is `BuskSpeedRail`**, mounted here and nowhere else in play mode — filling the sheet's
 * width and drawing no heading since 2026-09-21. **Colour is `ColourSheet`** (D8): the colour
 * editor's body hosted here, writing literals to Local for the selection. **Spread is
 * `SpreadSheet`** (D9, D10): two intents the desk resolves per head; its preview strip went the same
 * day, the rig being the preview. `LIVE_SHEET_TABS` in `lib/buskWindow.ts` is still the one list —
 * a fourth tab would be hidden there until it landed, because a tab that opens onto nothing is a
 * promise the desk cannot keep.
 *
 * **The Colour tab's *Spread to a second colour…* button opens Spread with *From* set.** The hand-over is a
 * `SpreadSeed` held by whichever host mounts the two tabs — they are never mounted together, so
 * the seed travels through the host's state: the button writes it and the fact, and `SpreadSheet`
 * applies it once and asks for it to be dropped, so a later visit to the tab by any other door
 * does not re-apply a stale colour.
 *
 * **The sheet is one fact, `busk.sheet`, and the fold is `none`.** There is no `sheetOpen`
 * beside it, whatever `Focus.dc.html`'s older sketch lists — the fold chevron writes `none`, a tab
 * glyph on the fold writes its tab, and both are the same store every other reader of the fact
 * uses (the announce, ⌘K, the Screens sheet, a MIDI `BuskSheetToggle`). A fact naming a tab that
 * has not landed draws the fold, so a `sheet=colour` link arriving early is quiet rather than
 * broken.
 *
 * **Off the desk board the rail is not drawn** — below `md`, as it never was, and on the short
 * board (`BuskingView`'s `board`), where a docked 288px rail would leave the page a bank four pads
 * wide: the sheet is `SideSheetOverlay`, a bottom sheet on an upright phone and a right-hand
 * overlay where the viewport is short, through `useCellEditorForm`'s three forms — the fold
 * decides the form, the window decides the tab — and it carries **no Speed tab**, because Speed is
 * the ShowBar's chip below `md` and the bar is on screen on the short board too. It opens from the
 * page strip's button onto Colour.
 *
 * The palette still replaces this whole region while editing; that swap is `BuskingView`'s.
 *
 * **Its chrome is the programmer rail's, through `components/sheet/sidePanel.ts`.** The two are
 * the same instrument — a column against the right edge of a live view, folded to a strip of
 * glyphs — and they had drifted in every measurement the chrome system is supposed to settle. The
 * body fill, the 40px header, the 40px strip cell, the chevron vocabulary (◀ opens, ▶ folds) and
 * the enter animation all come from that module now; what stays this view's own is the *fact*
 * behind the fold, because `busk.sheet` is a per-window value the announce, ⌘K, the Screens sheet
 * and MIDI all write, where the rail's `collapsed` is a stored desk preference.
 */

interface TabSpec {
  id: BuskSheetTab
  label: string
  icon: LucideIcon
}

export const SIDE_SHEET_TABS: readonly TabSpec[] = [
  { id: 'speed', label: 'Speed', icon: Gauge },
  { id: 'colour', label: 'Colour', icon: Palette },
  { id: 'spread', label: 'Spread', icon: Waves },
]

/**
 * Which tabs a sheet offers in a given form: the landed ones, docked; the landed ones **minus
 * Speed** in every overlay form below `md`, where the ShowBar's chip already reaches every master
 * (D7). `'popover'` is an overlay form too, not a second name for docked: `useCellEditorForm`
 * answers it for any viewport 640px and wider that is not short, which includes the 640–767px
 * band where the rail is still not drawn — and an overlay with a Speed tab and no rail behind it
 * would open onto nothing.
 */
export function sideSheetTabs(form: 'docked' | CellEditorForm): readonly TabSpec[] {
  const live = SIDE_SHEET_TABS.filter((tab) => LIVE_SHEET_TABS.includes(tab.id))
  return form === 'docked' ? live : live.filter((tab) => tab.id !== 'speed')
}

export interface SideSheetProps {
  projectId: number
  selectedTargets: Map<string, BuskingTarget>
  /** The selection's attribute mask, for the Colour tab's header pill. Null is every attribute. */
  families: AttributeFamily[] | null
}

/**
 * The *Second colour* hand-over, as one hook both hosts share: the seed, the button's handler
 * (which also opens the tab), and the drop the Spread tab calls once it has read it.
 */
function useSpreadSeed() {
  const [seed, setSeed] = useState<SpreadSeed | null>(null)
  const onSpread = useCallback((from: { r: number; g: number; b: number }) => {
    setSeed((prev) => ({ from: { r: from.r, g: from.g, b: from.b }, key: (prev?.key ?? 0) + 1 }))
    setBuskSheet('spread')
  }, [])
  const onSeedConsumed = useCallback(() => setSeed(null), [])
  return { seed, onSpread, onSeedConsumed }
}

/** The docked sheet, on the desk board: the fold when `busk.sheet` is `none`, else the tab strip and the tab. */
export function SideSheet({ projectId, selectedTargets, families }: SideSheetProps) {
  const sheet = useBuskSheet()
  const { seed, onSpread, onSeedConsumed } = useSpreadSeed()
  const tabs = sideSheetTabs('docked')
  const open = tabs.find((tab) => tab.id === sheet)
  // Latched here rather than inside the panel below: the fold and the panel are two subtrees of
  // this component and only one is ever mounted, so a hook in either would see every appearance
  // as its first render and animate on arrival at the route as readily as on an unfold.
  const enter = usePanelEnter(open != null)
  const overlay = useSidePanelMode() === 'overlay'
  if (open == null) {
    return <SideSheetFold projectId={projectId} selectedTargets={selectedTargets} tabs={tabs} />
  }
  return (
    <DockedSideSheet openId={open.id} enter={enter} overlay={overlay}>
      <div role="tablist" aria-label="Side sheet" className={cn(CHROME_ROW_CLASS, 'gap-0.5')}>
        {/* **The tabs are what gives, and the two buttons never do.** The group takes the row's
            slack and clips its own overflow, so a row too narrow for everything loses the end of
            the last tab rather than pushing the mode toggle and the fold chevron outside the
            panel — which is what happened when the toggle was added to a row already tuned to
            fit. `SHEET_MIN_WIDTH` is set so this never actually bites; it is here so that the
            next thing added to the row degrades instead of clipping. */}
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === open.id}
              onClick={() => setBuskSheet(tab.id)}
              // `px-2`, not the 10px it was: at 10px the row came to more than the column has,
              // which the browser pays for by eating the gutter.
              className={cn(
                'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors',
                tab.id === open.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <tab.icon className="size-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
        <SidePanelModeToggle className="shrink-0" />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setBuskSheet('none')}
          aria-label="Fold the side sheet"
          title="Fold the sheet to its strip"
          className={cn(SIDE_PANEL_HEADER_BUTTON_CLASS, 'shrink-0')}
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
      {/* The tab sizes itself and scrolls itself; the wrapper only hands it the column's height.
          The left edge is this panel's now, so a tab's own `border-l` is taken off — the region
          has one line down its side, not two stacked on the same pixel. */}
      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col *:min-h-0 *:flex-1 *:border-l-0">
        {open.id === 'speed' && <BuskSpeedRail />}
        {open.id === 'colour' && (
          <ColourSheet projectId={projectId} selectedTargets={selectedTargets} families={families} onSpread={onSpread} />
        )}
        {open.id === 'spread' && (
          <SpreadSheet
            projectId={projectId}
            selectedTargets={selectedTargets}
            families={families}
            seed={seed}
            onSeedConsumed={onSeedConsumed}
          />
        )}
      </div>
    </DockedSideSheet>
  )
}

/** The busk sheet's docked width, in px. `localStorage`, like the rail's: a width is a fact
 *  about this desk's screen, not about which of two windows you are looking at — which is what
 *  every other `busk.*` key in `sessionStorage` is. */
const SHEET_WIDTH_KEY = 'busk.sheet.width'

/**
 * **This sheet's own floor, above the shared 260, and its header is what sets it.** Three
 * labelled tabs (73 + 75 + 78) with 2px between them, the mode toggle and the fold chevron
 * (24 each) inside the chrome row's 12px gutters come to **304px** — so at 260 the row overflowed
 * by 38 and pushed both buttons clean outside the panel. Measured in the browser at 1180×820,
 * where the Spread tab's own curve and order rows stop overflowing at the same 300.
 *
 * 320 rather than 304: a minimum that sits on the exact fit clips again the moment anything joins
 * that row, which is precisely how this broke — the row fitted until the mode toggle was added to
 * it. The default is the minimum, so the sheet opens at the narrowest width that is honest; it was
 * 288, which is below the floor and is clamped up on read for any desk that stored it.
 */
const SHEET_MIN_WIDTH = 320
const SHEET_DEFAULT_WIDTH = 320

/**
 * The panel around the sheet's header and tab: the width, the drag that sets it, and which of the
 * two modes it is drawn in — `RailBodyFrame`'s counterpart, and the same `children` contract.
 *
 * **The contents arrive as `children` and that is load-bearing, not tidiness.** The width changes
 * at pointer rate during a drag, so whatever holds it re-renders at pointer rate; holding it in
 * `SideSheet` itself would re-render `BuskSpeedRail`, `ColourSheet` or `SpreadSheet` sixty times
 * a second, and a colour picker being dragged is not a thing to rebuild per frame. As `children`
 * the element reference is unchanged between the frame's renders, so React skips those subtrees
 * entirely — exactly how `RailBodyFrame` keeps the rail's two lists out of its own drag.
 */
function DockedSideSheet({
  openId,
  enter,
  overlay,
  children,
}: {
  openId: string
  enter: boolean
  overlay: boolean
  children: ReactNode
}) {
  const { width, resizing, onResizeStart } = useSidePanelResize({
    storageKey: SHEET_WIDTH_KEY,
    fallback: SHEET_DEFAULT_WIDTH,
    min: SHEET_MIN_WIDTH,
  })
  const style = { '--sheet-w': `${width}px` } as CSSProperties
  return (
    <div
      data-side-sheet={openId}
      data-sheet-mode={overlay ? 'overlay' : 'push'}
      role="complementary"
      aria-label="Side sheet"
      style={style}
      className={cn(
        SIDE_PANEL_BODY_CLASS,
        // `relative` is the handle's containing block in push mode; in overlay mode the shared
        // overlay class positions the panel itself and this is already satisfied.
        'relative hidden w-[var(--sheet-w)] md:flex',
        // Over the page, or beside it — `lib/sidePanelMode.ts`, one fact shared with the rail.
        // Either way the fold is not drawn behind it: `SideSheet` renders the fold or the panel,
        // never both, which is the reading the rail's strip was brought onto.
        overlay ? SIDE_PANEL_OVERLAY_CLASS : 'shrink-0',
        // `select-none` while the drag runs, so it does not paint a text selection across the
        // page it crosses. The cursor is the handle's own.
        resizing && 'select-none',
        enter && SIDE_PANEL_ENTER_CLASS,
      )}
    >
      <SidePanelResizeHandle label="the side sheet" onResizeStart={onResizeStart} />
      {children}
    </div>
  )
}

/**
 * The sheet off the desk board — below `md`, and on the short board — as a bottom sheet or a
 * right-hand sheet. Open while `busk.sheet` names a tab this form offers; closing writes `none`,
 * the same fact the fold chevron writes. It carries Colour and Spread; Colour is the tab the page
 * strip's button opens onto, and on the short board both take their compact layout, since that
 * form exists for a viewport with no height.
 */
export function SideSheetOverlay({ projectId, selectedTargets, families }: SideSheetProps) {
  const form = useCellEditorForm()
  const sheet = useBuskSheet()
  const { seed, onSpread, onSeedConsumed } = useSpreadSeed()
  const tabs = sideSheetTabs(form)
  const open = tabs.find((tab) => tab.id === sheet)
  return (
    <Sheet open={open != null} onOpenChange={(next) => !next && setBuskSheet('none')}>
      <SheetContent
        side={form === 'bottom-sheet' ? 'bottom' : 'right'}
        className={cn('flex flex-col gap-0 p-0', form === 'bottom-sheet' ? 'h-[66vh] rounded-t-xl' : 'w-72')}
        style={{ maxWidth: 'none' }}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{open?.label ?? 'Side sheet'}</SheetTitle>
          <SheetDescription>The busk view’s side sheet</SheetDescription>
        </SheetHeader>
        <div
          role="tablist"
          aria-label="Side sheet"
          // The chrome row's own 12px gutter, at a touch height. Its inset was 8px and is
          // 12 now, deliberately: a tab row is a chrome row here as much as on the desk board,
          // and this one carries two tabs and no chevron, so it has the width to spare.
          className={cn(CHROME_ROW_CLASS, 'h-11 gap-0.5')}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === open?.id}
              onClick={() => setBuskSheet(tab.id)}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold',
                tab.id === open?.id ? 'bg-muted text-foreground' : 'text-muted-foreground',
              )}
            >
              <tab.icon className="size-4" />
              {tab.label}
            </button>
          ))}
        </div>
        {open?.id === 'colour' && (
          <div role="tabpanel" className="flex min-h-0 flex-1 flex-col *:min-h-0 *:flex-1 *:border-l-0">
            <ColourSheet
              projectId={projectId}
              selectedTargets={selectedTargets}
              families={families}
              compact={form === 'side-sheet'}
              onSpread={onSpread}
            />
          </div>
        )}
        {open?.id === 'spread' && (
          <div role="tabpanel" className="flex min-h-0 flex-1 flex-col *:min-h-0 *:flex-1 *:border-l-0">
            <SpreadSheet
              projectId={projectId}
              selectedTargets={selectedTargets}
              families={families}
              compact={form === 'side-sheet'}
              seed={seed}
              onSeedConsumed={onSeedConsumed}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

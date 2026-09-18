import { useCallback, useState } from 'react'
import { Gauge, Palette, PanelRightClose, Waves, type LucideIcon } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useCellEditorForm, type CellEditorForm } from '@/components/sheet/cells/CellEditorSurface'
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
 * **Speed is `BuskSpeedRail` unchanged**, mounted here and nowhere else in play mode. **Colour is
 * `ColourSheet`** (D8): the colour editor's body hosted here, writing literals to Local for the
 * selection. **Spread is `SpreadSheet`** (D9, D10): two intents the desk resolves per head, and a
 * preview drawn from its answer. `LIVE_SHEET_TABS` in `lib/buskWindow.ts` is still the one list —
 * a fourth tab would be hidden there until it landed, because a tab that opens onto nothing is a
 * promise the desk cannot keep.
 *
 * **The Colour tab's *Second colour* switch opens Spread with *From* set.** The hand-over is a
 * `SpreadSeed` held by whichever host mounts the two tabs — they are never mounted together, so
 * the seed travels through the host's state: the switch writes it and the fact, and `SpreadSheet`
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
 * The *Second colour* hand-over, as one hook both hosts share: the seed, the switch's handler
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
  if (open == null) {
    return <SideSheetFold projectId={projectId} selectedTargets={selectedTargets} tabs={tabs} />
  }
  return (
    <div data-side-sheet={open.id} className="hidden w-72 shrink-0 flex-col md:flex">
      <div role="tablist" aria-label="Side sheet" className="flex h-9 shrink-0 items-center gap-0.5 border-b border-l px-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === open.id}
            onClick={() => setBuskSheet(tab.id)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors',
              tab.id === open.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <tab.icon className="size-3.5" />
            {tab.label}
          </button>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setBuskSheet('none')}
          aria-label="Fold the side sheet"
          title="Fold the sheet to its 44px strip"
          className="rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <PanelRightClose className="size-4" />
        </button>
      </div>
      {/* The rail sizes itself and scrolls itself; the wrapper only hands it the column's height.
          Its own `border-l` continues the strip's, so the region has one left edge, not two. */}
      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col *:min-h-0 *:flex-1">
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
        <div role="tablist" aria-label="Side sheet" className="flex h-11 shrink-0 items-center gap-0.5 border-b px-2">
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

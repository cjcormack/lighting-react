import { AudioWaveform, Grid3x3, LayoutGrid, Theater, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePersistentToggle } from '@/hooks/usePersistentState'
import { useEffectsOverview } from '@/hooks/useEffectsOverview'

/**
 * The four collapsible panels Layout hangs under the header, as data.
 *
 * They were four all-but-identical toggle components and three one-line hooks wrapping
 * `usePersistentToggle`, plus a fifth hand-written copy of the same list inside the command
 * palette — which is how the Stage panel ended up with two different icons depending on where you
 * reached it from. One array now feeds both surfaces, so a fifth panel is a row here.
 *
 * `label` is the palette's noun (title case, it heads a list); `noun` is the toolbar tooltip's,
 * which reads "Show …" / "Hide …". They differ per panel and always have.
 */
type OverviewPanelId = 'stage' | 'fixtures' | 'cueSlots' | 'effects'

interface OverviewPanelDescriptor {
  id: OverviewPanelId
  label: string
  noun: string
  icon: LucideIcon
  storageKey: string
}

/** Declaration order is display order, left to right in the toolbar and top to bottom in the palette. */
const DESCRIPTORS: readonly OverviewPanelDescriptor[] = [
  {
    id: 'stage',
    label: 'Stage Overview',
    noun: 'stage',
    // lucide `Theater`, which is what the command palette always used. The toolbar had a
    // hand-rolled stage-and-spotlight SVG; two glyphs for one panel is worse than either.
    icon: Theater,
    storageKey: 'stage-overview-visible',
  },
  {
    id: 'fixtures',
    label: 'Fixture Overview',
    noun: 'fixture overview',
    icon: LayoutGrid,
    storageKey: 'fixture-overview-visible',
  },
  {
    id: 'cueSlots',
    label: 'Cue Slots',
    noun: 'FX cue slots',
    icon: Grid3x3,
    storageKey: 'cue-slot-overview-visible',
  },
  {
    id: 'effects',
    label: 'Effects Overview',
    noun: 'effects overview',
    icon: AudioWaveform,
    // Held by `useEffectsOverview`, which OR-s this stored preference with the FX page's lock.
    storageKey: 'effects-overview-visible',
  },
]

const BY_ID = Object.fromEntries(DESCRIPTORS.map((d) => [d.id, d])) as Record<
  OverviewPanelId,
  OverviewPanelDescriptor
>

/** One panel's visibility, however it is held. */
interface PanelVisibility {
  isVisible: boolean
  toggle: () => void
  isLocked: boolean
}

/** One panel's live state, ready for the toolbar, the palette and the panel itself. */
export interface OverviewPanel extends OverviewPanelDescriptor {
  isVisible: boolean
  toggle: () => void
  /** Effects only: the FX page holds the panel open and the toggle inert while it is mounted. */
  isLocked: boolean
}

/**
 * Visibility for all four panels.
 *
 * The hooks are written out rather than mapped over `DESCRIPTORS`, because they are hooks and
 * their order and count have to be statically obvious. They are then paired with their descriptors
 * **by id**, through a `Record` the compiler makes exhaustive — never by array index, which would
 * mean reordering `DESCRIPTORS` silently put one panel's icon and label on another's storage key
 * and visibility. That is the same class of mismatch this module was written to end.
 */
export function useOverviewPanels(): {
  panels: readonly OverviewPanel[]
  byId: Record<OverviewPanelId, OverviewPanel>
  lockEffects: () => void
  unlockEffects: () => void
} {
  const stage = usePersistentToggle(BY_ID.stage.storageKey)
  const fixtures = usePersistentToggle(BY_ID.fixtures.storageKey)
  const cueSlots = usePersistentToggle(BY_ID.cueSlots.storageKey)
  const effects = useEffectsOverview()

  const visibility: Record<OverviewPanelId, PanelVisibility> = {
    stage: { isVisible: stage.isVisible, toggle: stage.toggle, isLocked: false },
    fixtures: { isVisible: fixtures.isVisible, toggle: fixtures.toggle, isLocked: false },
    cueSlots: { isVisible: cueSlots.isVisible, toggle: cueSlots.toggle, isLocked: false },
    effects: {
      isVisible: effects.isVisible,
      toggle: effects.toggle,
      isLocked: effects.isLocked,
    },
  }

  const panels = DESCRIPTORS.map((d) => ({ ...d, ...visibility[d.id] }))

  return {
    panels,
    byId: Object.fromEntries(panels.map((p) => [p.id, p])) as Record<
      OverviewPanelId,
      OverviewPanel
    >,
    lockEffects: effects.lock,
    unlockEffects: effects.unlock,
  }
}

/** The header button for one overview panel. */
export function OverviewToggle({ panel }: { panel: OverviewPanel }) {
  const { icon: Icon, noun, isVisible, isLocked, toggle } = panel
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          disabled={isLocked}
          className={
            isVisible
              ? 'text-primary-foreground bg-primary-foreground/20 hover:bg-primary-foreground/30'
              : 'text-primary-foreground hover:bg-primary-foreground/10'
          }
        >
          <Icon className="size-5" />
        </Button>
      </TooltipTrigger>
      {/* The locked branch is a whole sentence. The effects toggle's old form left ` effects
          overview` outside the ternary, so a locked toggle read "…locked while in FX view) effects
          overview" — and it is the FX *page* that holds it open; "view" named a surface that no
          longer exists. */}
      <TooltipContent>
        {isLocked
          ? `${panel.label} (held open by the FX page)`
          : `${isVisible ? 'Hide' : 'Show'} ${noun}`}
      </TooltipContent>
    </Tooltip>
  )
}

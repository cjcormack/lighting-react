import { Layers, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useGroupListQuery } from '@/store/groups'
import { useFixtureListQuery } from '@/store/fixtures'
import { buskingTargetKey, type BuskingTarget } from './buskingTypes'
import { BuskLabel } from './BuskLabel'

interface TargetBandProps {
  selectedTargets: Map<string, BuskingTarget>
  onToggle: (target: BuskingTarget) => void
  onClear: () => void
  /** Opens the narrow-width target sheet. Rendered only below `md`, where the sheet is the fallback. */
  onOpenPicker: () => void
}

/**
 * The selection bank: every group and fixture as a toggle pad, across the top of the busk view.
 *
 * This replaces the desktop sidebar list, and the replacement is the point rather than a
 * relocation. A sidebar spent 208-288px of permanent width on a list the operator reads once per
 * selection change, taking it out of the pads — which are what the surface is for. Two rows of
 * pads scrolling sideways spend height instead, of which a pad grid has more.
 *
 * **Groups first, then fixtures, into one column-flow grid** — not a groups row above a fixtures
 * row. `grid-flow-col` with two rows packs each pair vertically and scrolls right, so the band's
 * height is fixed at two pads whatever the rig size. The two kinds stay distinguishable by their
 * icon and by the member-count badge, which only a group carries.
 *
 * **A press is a plain toggle.** The list this replaces was left-click-replace and
 * right-click-toggle, which has no gesture on a touchscreen and was undiscoverable with a mouse.
 * `selectTarget` (replace) survives for the narrow-width sheet, where tapping a row and having the
 * sheet close on the one thing you picked is the right behaviour.
 */
export function TargetBand({
  selectedTargets,
  onToggle,
  onClear,
  onOpenPicker,
}: TargetBandProps) {
  const { data: groups } = useGroupListQuery()
  const { data: fixtures } = useFixtureListQuery()

  const selected = [...selectedTargets.values()]
  const summary =
    selected.length === 0
      ? 'nothing selected'
      : `${selected.length} selected · ${selected
          .map((t) => (t.type === 'group' ? t.name : t.fixture.name))
          .join(', ')}`

  return (
    <div className="shrink-0 border-b px-4 pt-2.5 pb-3">
      <div className="mb-2 flex items-baseline gap-2.5">
        <BuskLabel>Targets</BuskLabel>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{summary}</span>
        {/* The band is the picker at every width the rail is; below that the sheet still is. */}
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs md:hidden" onClick={onOpenPicker}>
          Pick targets…
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onClear}
          disabled={selected.length === 0}
        >
          Clear
        </Button>
      </div>

      {(groups?.length ?? 0) + (fixtures?.length ?? 0) === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No fixtures or groups configured
        </p>
      ) : (
        <div className="grid grid-flow-col grid-rows-2 justify-start gap-2 overflow-x-auto pb-0.5">
          {(groups ?? []).map((group) => {
            const target: BuskingTarget = { type: 'group', name: group.name, group }
            return (
              <TargetPad
                key={buskingTargetKey(target)}
                icon={Layers}
                name={group.name}
                count={group.memberCount}
                isSelected={selectedTargets.has(buskingTargetKey(target))}
                onToggle={() => onToggle(target)}
              />
            )
          })}
          {(fixtures ?? []).map((fixture) => {
            const target: BuskingTarget = { type: 'fixture', key: fixture.key, fixture }
            return (
              <TargetPad
                key={buskingTargetKey(target)}
                icon={LayoutGrid}
                name={fixture.name}
                isSelected={selectedTargets.has(buskingTargetKey(target))}
                onToggle={() => onToggle(target)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * One target pad.
 *
 * Deliberately the same three-state colour language as `EffectPadButton`, minus the middle rung: a
 * target is selected or it is not, so there is no "some" to draw. Sharing the vocabulary is what
 * makes the whole surface read as one instrument — a lit pad means the same thing wherever it is.
 */
function TargetPad({
  icon: Icon,
  name,
  count,
  isSelected,
  onToggle,
}: {
  icon: typeof Layers
  name: string
  count?: number
  isSelected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onToggle}
      className={cn(
        'flex h-13 min-w-[148px] items-center gap-2 whitespace-nowrap rounded-lg border px-3.5',
        'select-none text-sm transition-all active:scale-[0.96]',
        isSelected
          ? 'border-primary bg-primary/20 ring-1 ring-primary/50 hover:bg-primary/25'
          : 'border-border bg-card hover:bg-accent/50',
      )}
    >
      <Icon className={cn('size-3.5 shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground')} />
      <span className="flex-1 truncate text-left">{name}</span>
      {count != null && (
        <span className="rounded-full bg-muted px-1.5 py-px text-[10px] tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </button>
  )
}

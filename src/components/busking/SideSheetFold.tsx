import { useMemo } from 'react'
import { PanelRightOpen, type LucideIcon } from 'lucide-react'
import { BeatIndicator } from '@/components/BeatIndicator'
import { FixtureAppearanceSource } from '@/components/fixtures/fixtureAppearance'
import { formatBpm } from '@/hooks/useBpmDraft'
import { useFixtureLookup } from '@/hooks/useFixtureLookup'
import { setBuskSheet, type BuskSheetTab } from '@/lib/buskWindow'
import { usePatchListQuery } from '@/store/patches'
import { useSpeedMasterLiveQuery } from '@/store/speedMasters'
import { selectedHeadCount, type BuskingTarget } from './buskingTypes'

/**
 * The side sheet **folded** to 44px (busk-further plan D7; `Sheets.dc.html` §Folded): the two live
 * readouts a busking operator glances at — the beat and master 1's tempo — the tab glyphs, so a
 * folded rail is still one tap from any tab, the selection's colour as a dot, and its head count.
 *
 * A tap on a glyph unfolds onto that tab; the chevron unfolds onto whichever tab was last open.
 * Both write `busk.sheet` and nothing else — the fold is that fact's `none`, not a state of its own.
 *
 * **The colour dot reads the stage's colour dispatch** (`FixtureAppearanceSource`), as the rig tile
 * does: the first selected fixture's, or the first member of the first selected group, so a fold
 * beside a lit selection shows what the rig is doing and not what the picker last said. A
 * selection with no head draws a dim ring.
 */
export function SideSheetFold({
  projectId,
  selectedTargets,
  tabs,
}: {
  projectId: number
  selectedTargets: Map<string, BuskingTarget>
  tabs: readonly { id: BuskSheetTab; label: string; icon: LucideIcon }[]
}) {
  const { data: live } = useSpeedMasterLiveQuery()
  const master1 = live?.find((master) => master.index === 1) ?? null
  const heads = selectedHeadCount([...selectedTargets.values()])

  return (
    <div data-side-sheet="none" className="hidden w-11 shrink-0 flex-col items-center gap-3 border-l py-2 md:flex">
      <button
        type="button"
        onClick={() => setBuskSheet(tabs[0]?.id ?? 'speed')}
        aria-label="Unfold the side sheet"
        title="Unfold the side sheet"
        className="rounded p-1 text-muted-foreground hover:text-foreground"
      >
        <PanelRightOpen className="size-4" />
      </button>

      <div className="flex flex-col items-center gap-1" title="Master 1">
        <BeatIndicator master={master1 == null ? undefined : { uuid: master1.uuid, index: 1 }} className="size-2" />
        <span data-fold-tempo className="text-[11px] font-semibold tabular-nums">
          {master1 == null ? '—' : formatBpm(master1.bpm)}
        </span>
      </div>

      <div className="flex flex-col items-center gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setBuskSheet(tab.id)}
            aria-label={`Open the ${tab.label} tab`}
            title={tab.label}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <tab.icon className="size-4" />
          </button>
        ))}
      </div>

      <span className="flex-1" />

      <SelectionColourDot projectId={projectId} selectedTargets={selectedTargets} />
      <span data-fold-heads className="text-[10px] tabular-nums text-muted-foreground" title="Selected heads">
        {heads}
      </span>
    </div>
  )
}

function SelectionColourDot({
  projectId,
  selectedTargets,
}: {
  projectId: number
  selectedTargets: Map<string, BuskingTarget>
}) {
  const { data: patches } = usePatchListQuery(projectId)
  const { fixtures, fixtureByKey, typeByKey } = useFixtureLookup()

  // The first head the selection names: a fixture target directly, a group through its first
  // patched member. Element keys are never parsed — a cell target carries its parent fixture.
  const head = useMemo(() => {
    for (const target of selectedTargets.values()) {
      if (target.type === 'fixture') return target.fixture.key
      const member = fixtures?.find((fixture) => fixture.groups.includes(target.name))
      if (member != null) return member.key
    }
    return null
  }, [selectedTargets, fixtures])
  const patch = head == null ? undefined : patches?.find((p) => p.key === head)

  if (patch == null) {
    return <span data-fold-colour className="size-3 rounded-full border border-muted-foreground/40" title="No selection" />
  }
  const fixture = fixtureByKey.get(patch.key)
  return (
    <FixtureAppearanceSource patch={patch} fixture={fixture} fixtureType={fixture == null ? undefined : typeByKey.get(fixture.typeKey)}>
      {(appearance) => (
        <span
          data-fold-colour
          className="size-3 rounded-full border border-border"
          style={{ background: appearance.color, opacity: 0.3 + 0.7 * appearance.intensity }}
          title="The selection's colour"
        />
      )}
    </FixtureAppearanceSource>
  )
}

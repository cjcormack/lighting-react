import { useMemo } from 'react'
import { AudioWaveform } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SpeedMasterChip } from '@/components/fx/SpeedMasterChip'
import { getBeatDivisionLabel } from '@/components/fx/fxConstants'
import { useActiveEffectsQuery } from '@/store/fixtureFx'
import { useProgrammerLayersQuery } from '@/store/programmer'
import { ProgrammerAddEffect } from './ProgrammerAddEffect'
import type { ActiveEffect } from '@/store/fixtureFx'

/**
 * What is running, one row per effect.
 *
 * Deliberately **not** `FxSheet`. With the tabs gone, the obvious move was to mount that sheet
 * beside the value grid — but it builds the whole fixture row model a second time, renders every
 * row unvirtualized, and subscribes to `useProgrammerRevision`, which fires on *every* programmer
 * event including each 30 Hz commit tick from the grid the operator is dragging in. On a 200-head
 * rig that is a full re-render of a 200-row tree at 30 Hz, while dragging.
 *
 * This band answers the question the design actually asks — "what is running, on what tempo, and
 * who owns it?" — from `ActiveEffect` alone, so it needs no row model and no revision subscription.
 * `FxSheet` stays available beneath it as a mount-on-demand diagnostic, which is where the old
 * "don't mount two row models" argument now lives.
 */
export function ProgrammerFxList() {
  const { data: effects } = useActiveEffectsQuery()
  const { data: layers } = useProgrammerLayersQuery()
  const running = effects ?? []
  // Named from the same broadcast the stack rail draws, so a row cannot claim a layer the list
  // beside it does not show.
  const layerHomes = useMemo(
    () =>
      new Map((layers ?? []).map((l, i) => [l.layerId, { name: l.source.name, position: i + 1 }])),
    [layers],
  )

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2 px-1 pb-1.5">
        <AudioWaveform className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold">FX running</span>
        <Badge variant="secondary" className="px-1.5 text-[10px] tabular-nums">
          {running.length}
        </Badge>
        <span className="flex-1" />
        <ProgrammerAddEffect />
      </div>
      {running.length === 0 ? (
        <p className="px-1 text-[11px] text-muted-foreground">
          Nothing running. Effects arrive from a busking pad, a Look, or the cue on stage.
        </p>
      ) : (
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          {running.map((effect) => (
            <FxRow key={effect.id} effect={effect} home={homeOf(effect, layerHomes)} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Where an effect lives, in the words the design asks for.
 *
 * The answer to "why can't I delete this?" and to "what will editing it break?". An effect is
 * never *on* a layer — it is **in a Look** (and travels with it, so every other layer applying
 * that Look runs it too) or **on the cue** (this once, belonging to nothing else) or loose in the
 * programmer band, which is what a busked effect is until something records it.
 */
function homeOf(
  effect: ActiveEffect,
  layerHomes: ReadonlyMap<number, { name: string; position: number }>,
): { label: string; detail?: string } {
  if (effect.programmerLayerId != null) {
    const home = layerHomes.get(effect.programmerLayerId)
    return {
      label: home ? `in ${home.name}` : 'in a look',
      detail: home ? `layer ${home.position}` : undefined,
    }
  }
  if (effect.cueId != null) return { label: 'on this cue', detail: 'ad-hoc' }
  if (effect.programmerOwned) return { label: 'programmer band', detail: 'yours until recorded' }
  return { label: 'base' }
}

function FxRow({ effect, home }: { effect: ActiveEffect; home: ReturnType<typeof homeOf> }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-xs">
      <span className="size-1.5 shrink-0 rounded-full bg-violet-500" />
      <span className="truncate font-medium">{effect.effectType}</span>
      <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
        → {effect.propertyName}
      </Badge>
      <span className="flex-1" />
      {effect.timingSource === 'WALL_CLOCK' ? (
        // A wall-clock effect has no beat division to show; its rate master is the interesting
        // number, and `SpeedMasterChip` already knows to stay silent at master 1.
        <SpeedMasterChip speedMasterUuid={effect.rateSpeedMasterUuid} kind="rate" />
      ) : (
        <>
          <SpeedMasterChip speedMasterUuid={effect.speedMasterUuid} />
          <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
            {getBeatDivisionLabel(effect.beatDivision)}
          </Badge>
        </>
      )}
      {/* Where it lives is the answer to "why can't I delete this?". */}
      <Badge
        variant={effect.programmerOwned ? 'default' : 'secondary'}
        className="shrink-0 text-[10px]"
        title={[home.label, home.detail].filter(Boolean).join(' · ')}
      >
        {home.label}
      </Badge>
      {home.detail && (
        <span className="hidden shrink-0 text-[10px] text-muted-foreground @[320px]:inline">
          {home.detail}
        </span>
      )}
    </div>
  )
}

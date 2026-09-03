import { useCallback, useMemo, useState } from 'react'
import { AudioWaveform, MoreHorizontal, Pencil, Plus, Square } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SpeedMasterChip } from '@/components/fx/SpeedMasterChip'
import { getBeatDivisionLabel } from '@/components/fx/fxConstants'
import { useActiveEffectsQuery, useEffectLibraryQuery, useRemoveFxMutation } from '@/store/fixtureFx'
import { useRemoveGroupFxMutation } from '@/store/groups'
import { useProgrammerLayersQuery } from '@/store/programmer'
import { familyCanHoldEffect, familyForEffectCategory } from '@/lib/attributeFamily'
import { ActiveEffectSheet } from '../busking/ActiveEffectSheet'
import { findEffectEntry, toEffectContext } from '../busking/buskingTypes'
import { ProgrammerAddEffect } from './ProgrammerAddEffect'
import { NewTemplateFromEffectSheet } from './NewTemplateFromEffectSheet'
import type { ActiveEffect, EffectLibraryEntry } from '@/store/fixtureFx'

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
 *
 * The row menu keeps to that, and each item pays for itself. **Edit…** goes through
 * `toEffectContext`, which maps an `ActiveEffect` to the parameter sheet's shape with no fixture or
 * group lookup at all — the sheet it opens does subscribe to the fixture list, which is why it is
 * mounted only while editing rather than sitting there empty. **Stop** is the same two mutations
 * `FxSheet`'s chip calls. The one standing query added is the FX **library**, which
 * *Save as template…* needs to read an effect's category: a single shared cache entry the whole app
 * already subscribes to, not a fetch per row.
 */
export function ProgrammerFxList() {
  const { data: effects } = useActiveEffectsQuery()
  const { data: layers } = useProgrammerLayersQuery()
  const { data: library } = useEffectLibraryQuery()
  const [removeFx] = useRemoveFxMutation()
  const [removeGroupFx] = useRemoveGroupFxMutation()
  /** Both sheets mount once, at the list, rather than one pair per row. */
  const [editing, setEditing] = useState<ActiveEffect | null>(null)
  const [saving, setSaving] = useState<ActiveEffect | null>(null)
  // Memoised on the effect being edited, not rebuilt per render: `ActiveEffectSheet` seeds its
  // draft from `context` in an effect keyed on that object's *identity*, and this band re-renders
  // on every `FixtureEffects` invalidation — which the FX socket raises constantly. A fresh object
  // each render would re-seed the open sheet mid-edit and throw away whatever was being adjusted.
  const editingContext = useMemo(() => (editing == null ? null : toEffectContext(editing)), [editing])
  const running = effects ?? []
  // Named from the same broadcast the stack rail draws, so a row cannot claim a layer the list
  // beside it does not show.
  const layerHomes = useMemo(
    () =>
      new Map((layers ?? []).map((l, i) => [l.layerId, { name: l.source.name, position: i + 1 }])),
    [layers],
  )

  // Same shape `FxSheet`'s chip uses, including the `.catch`: `errorToastMiddleware` reports the
  // failure, and this only stops the unhandled rejection.
  const stopEffect = useCallback(
    (effect: ActiveEffect) => {
      const request = effect.isGroupTarget
        ? removeGroupFx({ id: effect.id, groupName: effect.targetKey })
        : removeFx({ id: effect.id, fixtureKey: effect.targetKey })
      request.unwrap().catch(() => {})
    },
    [removeFx, removeGroupFx],
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
            <FxRow
              key={effect.id}
              effect={effect}
              home={homeOf(effect, layerHomes)}
              saveAsTemplate={saveAsTemplateOffer(effect, library)}
              onEdit={() => setEditing(effect)}
              onSaveAsTemplate={() => setSaving(effect)}
              onStop={() => stopEffect(effect)}
            />
          ))}
        </div>
      )}
      {/* Mounted only while editing, unlike `FxSheet`'s copy — that one is already a
          mount-on-demand diagnostic, while this band is always on screen, and `ActiveEffectSheet`
          subscribes to the fixture list. Mounting it eagerly would put back exactly the standing
          subscription this band's docblock keeps it clear of. */}
      {editingContext != null && (
        <ActiveEffectSheet context={editingContext} onClose={() => setEditing(null)} />
      )}
      <NewTemplateFromEffectSheet
        open={saving != null}
        onOpenChange={(next) => !next && setSaving(null)}
        effect={saving}
      />
    </div>
  )
}

/**
 * Whether this effect can become a template, and why not when it cannot.
 *
 * Two independent gates, and the order matters for what the operator is told:
 *
 *  - **The programmer must own it.** A copy of an effect that already belongs to a Look or a
 *    template is not a new named thing — the named thing exists, and *Edit template* is the gesture.
 *    An effect on a cue is that cue's, and a base effect belongs to the show.
 *  - **Its category must map to a template family.** `controls` has no tempo and `composite` spans
 *    families, so neither can name one; `beam` is refused by name server-side so a script-registered
 *    beam effect cannot mint a Beam effect template behind the rule.
 *
 * Returns a reason rather than false, because the item is **shown disabled** in both cases. A menu
 * that silently loses an entry teaches nobody why.
 */
function saveAsTemplateOffer(
  effect: ActiveEffect,
  library: EffectLibraryEntry[] | undefined,
): { enabled: boolean; reason?: string } {
  if (!effect.programmerOwned || effect.lookId != null || effect.templateId != null || effect.programmerLayerId != null) {
    return {
      enabled: false,
      reason:
        effect.sourceName != null
          ? `Already named — this is “${effect.sourceName}” running. Edit that instead.`
          : 'Only an effect the programmer owns can become a template. This one belongs to a cue or the show.',
    }
  }
  // Two different absences, and telling them apart is the point: a library that has not arrived is
  // a wait, while a miss against a loaded one is an effect type this desk's registry does not know
  // — an import from a desk with script-registered effects. Reporting the second as the first
  // leaves the item disabled forever under a message that promises it is about to work.
  if (library == null) return { enabled: false, reason: 'Reading the effect library…' }
  const entry = findEffectEntry(library, effect.effectType)
  if (entry == null) {
    return {
      enabled: false,
      reason: `“${effect.effectType}” is not in this desk's effect library, so its category — and so the template's family — cannot be read.`,
    }
  }
  const family = familyForEffectCategory(entry.category)
  if (family == null || !familyCanHoldEffect(family)) {
    return {
      enabled: false,
      reason: `A “${entry.category}” effect is not banked by family, so it cannot be a template. It can live in a recorded look.`,
    }
  }
  return { enabled: true }
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
    // The layer broadcast first, because it is the same list the stack rail draws and it can also
    // say *which* layer. `sourceName` is the fallback and is right for both kinds since
    // fx-templates D7 — an effect can come from a template as well as a Look, and the old literal
    // "in a look" named the wrong entity for half of them.
    const name = home?.name ?? effect.sourceName
    return {
      label: name != null ? `in ${name}` : 'in a layer',
      detail: home ? `layer ${home.position}` : undefined,
    }
  }
  if (effect.cueId != null) return { label: 'on this cue', detail: 'ad-hoc' }
  if (effect.programmerOwned) return { label: 'programmer band', detail: 'yours until recorded' }
  return { label: 'base' }
}

function FxRow({
  effect,
  home,
  saveAsTemplate,
  onEdit,
  onSaveAsTemplate,
  onStop,
}: {
  effect: ActiveEffect
  home: ReturnType<typeof homeOf>
  saveAsTemplate: { enabled: boolean; reason?: string }
  onEdit: () => void
  onSaveAsTemplate: () => void
  onStop: () => void
}) {
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            aria-label={`Actions for ${effect.effectType}`}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="size-3.5" />
            Edit…
          </DropdownMenuItem>
          {/* Shown disabled with the reason rather than omitted, so "why is this not offered?" is
              answerable from the menu itself. `title` carries it — a disabled item takes no hover
              card, and the reasons are a sentence rather than a label. */}
          <DropdownMenuItem
            disabled={!saveAsTemplate.enabled}
            onClick={onSaveAsTemplate}
            title={saveAsTemplate.reason}
          >
            <Plus className="size-3.5" />
            Save as template…
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onStop}>
            <Square className="size-3.5" />
            Stop
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

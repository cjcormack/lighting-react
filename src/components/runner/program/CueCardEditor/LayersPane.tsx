import { useMemo, useState } from 'react'
import {
  AudioWaveform,
  Bookmark,
  ListChecks,
  Plus,
  Sliders,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EffectSummary } from '@/components/fx/EffectSummary'
import { PresetApplicationSummary } from '@/components/fx/PresetApplicationSummary'
import { TimingBadge } from '@/components/cues/TimingBadge'
import {
  fromCueAdHocEffect,
  fromPresetEffect,
} from '@/components/fx/effectSummaryTypes'
import { useEffectLibraryQuery, type EffectLibraryEntry } from '@/store/fixtureFx'
import { useProjectPresetListQuery } from '@/store/fxPresets'
import { usePaletteListQuery } from '@/store/palettes'
import { usePatchProjectCueMutation } from '@/store/cues'
import { buildCueInput } from '@/lib/cueUtils'
import { PaletteRefBadge } from '@/components/palettes/PaletteRefBadge'
import { PalettePreviewRow } from '@/components/palettes/paletteValue'
import { parsePaletteRefUuid } from '@/lib/programmerValue'
import { describeHealth } from '@/lib/healthDescriptor'
import { AddAssignmentSheet } from './AddAssignmentSheet'
import { AddEffectSheet } from './AddEffectSheet'
import { AddPresetSheet } from './AddPresetSheet'
import type {
  Cue,
  CueAdHocEffect,
  CuePropertyAssignment,
} from '@/api/cuesApi'
import type { FxPreset } from '@/api/fxPresetsApi'
import type { PaletteSummary } from '@/api/palettesApi'
import type { CueTarget } from '@/api/cuesApi'

export type LayersMode = 'by-target' | 'by-layer'

interface LayersPaneProps {
  cue: Cue
  projectId: number
  mode: LayersMode
  targets: CueTarget[]
}

/**
 * Renders the cue body — assignments + effects + presets — in either a
 * by-target arrangement (one card per target) or a by-layer arrangement
 * (top-level Presets / Assignments / Effects sections).
 *
 * All "Add" affordances open right-hand sheets; all removes auto-PATCH.
 */
export function LayersPane({ cue, projectId, mode, targets }: LayersPaneProps) {
  const { data: library } = useEffectLibraryQuery()
  const { data: presets } = useProjectPresetListQuery(projectId)
  const { data: paletteList } = usePaletteListQuery({ projectId })
  const [patchCue] = usePatchProjectCueMutation()

  // Built once for the whole pane and threaded to both arrangements. A per-row lookup would
  // mean one subscription per assignment row, and a cue with forty rows referencing four
  // palettes would fetch the bank forty times.
  const palettes = useMemo(
    () => new Map((paletteList ?? []).map((palette) => [palette.uuid, palette])),
    [paletteList],
  )
  const palettesLoaded = paletteList != null

  const [addPresetTarget, setAddPresetTarget] = useState<CueTarget | 'any' | null>(null)
  const [addEffectTarget, setAddEffectTarget] = useState<CueTarget | 'any' | null>(null)
  const [addAssignmentTarget, setAddAssignmentTarget] = useState<CueTarget | 'any' | null>(null)

  const removeAssignment = (index: number) => {
    const next = (buildCueInput(cue).propertyAssignments ?? []).filter((_, i) => i !== index)
    patchCue({ projectId, cueId: cue.id, propertyAssignments: next })
  }
  const removeEffect = (index: number) => {
    const next = buildCueInput(cue).adHocEffects.filter((_, i) => i !== index)
    patchCue({ projectId, cueId: cue.id, adHocEffects: next })
  }
  const removePreset = (index: number) => {
    const next = buildCueInput(cue).presetApplications.filter((_, i) => i !== index)
    patchCue({ projectId, cueId: cue.id, presetApplications: next })
  }

  const addAssignment = (a: CuePropertyAssignment) => {
    const next = [...(buildCueInput(cue).propertyAssignments ?? []), a]
    patchCue({ projectId, cueId: cue.id, propertyAssignments: next })
  }
  const addEffect = (e: CueAdHocEffect) => {
    const next = [...buildCueInput(cue).adHocEffects, e]
    patchCue({ projectId, cueId: cue.id, adHocEffects: next })
  }
  const addPresetApp = (
    presetId: number,
    appTargets: CueTarget[],
    timing: { delayMs?: number | null; intervalMs?: number | null; randomWindowMs?: number | null },
  ) => {
    const next = [
      ...buildCueInput(cue).presetApplications,
      {
        presetId,
        targets: appTargets,
        delayMs: timing.delayMs ?? null,
        intervalMs: timing.intervalMs ?? null,
        randomWindowMs: timing.randomWindowMs ?? null,
      },
    ]
    patchCue({ projectId, cueId: cue.id, presetApplications: next })
  }

  const sheets = (
    <>
      <AddAssignmentSheet
        open={addAssignmentTarget != null}
        onOpenChange={(open) => {
          if (!open) setAddAssignmentTarget(null)
        }}
        cue={cue}
        projectId={projectId}
        defaultTarget={addAssignmentTarget === 'any' ? null : addAssignmentTarget}
        onAdd={(a) => {
          addAssignment(a)
          setAddAssignmentTarget(null)
        }}
      />
      <AddEffectSheet
        open={addEffectTarget != null}
        onOpenChange={(open) => {
          if (!open) setAddEffectTarget(null)
        }}
        defaultTarget={addEffectTarget === 'any' ? null : addEffectTarget}
        palette={cue.palette}
        onAdd={(e) => {
          addEffect(e)
          setAddEffectTarget(null)
        }}
      />
      <AddPresetSheet
        open={addPresetTarget != null}
        onOpenChange={(open) => {
          if (!open) setAddPresetTarget(null)
        }}
        projectId={projectId}
        defaultTarget={addPresetTarget === 'any' ? null : addPresetTarget}
        onAdd={(presetId, appTargets, timing) => {
          addPresetApp(presetId, appTargets, timing)
          setAddPresetTarget(null)
        }}
      />
    </>
  )

  return (
    <>
      {mode === 'by-target' ? (
        <ByTarget
          cue={cue}
          targets={targets}
          presets={presets}
          library={library}
          palettes={palettes}
          palettesLoaded={palettesLoaded}
          onRemoveAssignment={removeAssignment}
          onRemoveEffect={removeEffect}
          onRemovePreset={removePreset}
          onAddAssignment={setAddAssignmentTarget}
          onAddEffect={setAddEffectTarget}
          onAddPreset={setAddPresetTarget}
        />
      ) : (
        <ByLayer
          cue={cue}
          presets={presets}
          library={library}
          palettes={palettes}
          palettesLoaded={palettesLoaded}
          onRemoveAssignment={removeAssignment}
          onRemoveEffect={removeEffect}
          onRemovePreset={removePreset}
          onAddAssignment={() => setAddAssignmentTarget('any')}
          onAddEffect={() => setAddEffectTarget('any')}
          onAddPreset={() => setAddPresetTarget('any')}
        />
      )}
      {sheets}
    </>
  )
}


function ByTarget({
  cue,
  targets,
  presets,
  library,
  palettes,
  palettesLoaded,
  onRemoveAssignment,
  onRemoveEffect,
  onRemovePreset,
  onAddAssignment,
  onAddEffect,
  onAddPreset,
}: {
  cue: Cue
  targets: CueTarget[]
  presets: FxPreset[] | undefined
  library: EffectLibraryEntry[] | undefined
  /** Keyed by uuid — a stored reference names the palette by uuid, never by id. */
  palettes: ReadonlyMap<string, PaletteSummary>
  palettesLoaded: boolean
  onRemoveAssignment: (index: number) => void
  onRemoveEffect: (index: number) => void
  onRemovePreset: (index: number) => void
  onAddAssignment: (target: CueTarget) => void
  onAddEffect: (target: CueTarget) => void
  onAddPreset: (target: CueTarget) => void
}) {
  const buckets = useMemo(() => {
    const map = new Map<
      string,
      {
        assignments: { a: CuePropertyAssignment; i: number }[]
        effects: { e: CueAdHocEffect; i: number }[]
        presetApps: { pa: Cue['presetApplications'][number]; i: number }[]
      }
    >()
    const bucket = (key: string) => {
      let b = map.get(key)
      if (!b) {
        b = { assignments: [], effects: [], presetApps: [] }
        map.set(key, b)
      }
      return b
    }
    cue.propertyAssignments.forEach((a, i) => {
      bucket(`${a.targetType}:${a.targetKey}`).assignments.push({ a, i })
    })
    cue.adHocEffects.forEach((e, i) => {
      bucket(`${e.targetType}:${e.targetKey}`).effects.push({ e, i })
    })
    cue.presetApplications.forEach((pa, i) => {
      for (const t of pa.targets) bucket(`${t.type}:${t.key}`).presetApps.push({ pa, i })
    })
    return map
  }, [cue])

  if (targets.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        No targets on this cue.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {targets.map((target) => {
        const { assignments, effects, presetApps } =
          buckets.get(`${target.type}:${target.key}`) ?? {
            assignments: [],
            effects: [],
            presetApps: [],
          }

        return (
          <div
            key={`${target.type}:${target.key}`}
            className={cn(
              'rounded-lg border bg-card overflow-hidden',
              target.type === 'fixture'
                ? 'border-amber-500/30'
                : 'border-blue-500/30',
            )}
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
              <span
                className={cn(
                  'size-2 rounded-full',
                  target.type === 'fixture' ? 'bg-amber-500' : 'bg-blue-400',
                )}
              />
              <span className="font-medium text-sm">{target.key}</span>
              <span className="text-xs text-muted-foreground">
                {target.type === 'fixture' ? 'Fixture' : 'Group'} ·{' '}
                {assignments.length + effects.length + presetApps.length} item
                {assignments.length + effects.length + presetApps.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="p-2 space-y-3">
              <Section
                title="Presets"
                icon={<Bookmark className="size-3.5" />}
                action={<AddBtn label="Add" onClick={() => onAddPreset(target)} />}
              >
                {presetApps.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground px-1">—</p>
                ) : (
                  presetApps.map(({ pa, i }) => {
                    const fullPreset = presets?.find((p) => p.id === pa.presetId)
                    const presetEffects = (fullPreset?.effects ?? []).map((e) =>
                      fromPresetEffect(e, library),
                    )
                    return (
                      <PresetApplicationSummary
                        key={`pa-${i}`}
                        presetName={pa.presetName ?? fullPreset?.name ?? null}
                        presetId={pa.presetId}
                        effects={presetEffects}
                        targets={pa.targets}
                        palette={cue.palette}
                        actions={
                          <>
                            <TimingBadge
                              delayMs={pa.delayMs}
                              intervalMs={pa.intervalMs}
                              randomWindowMs={pa.randomWindowMs}
                            />
                            <RemoveBtn onClick={() => onRemovePreset(i)} />
                          </>
                        }
                      />
                    )
                  })
                )}
              </Section>

              <Section
                title="Assignments"
                icon={<Sliders className="size-3.5" />}
                action={
                  <AddBtn label="Add" onClick={() => onAddAssignment(target)} />
                }
              >
                {assignments.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground px-1">—</p>
                ) : (
                  assignments.map(({ a, i }) => (
                    <AssignmentRow
                      key={`a-${i}`}
                      assignment={a}
                      palettes={palettes}
                      palettesLoaded={palettesLoaded}
                      onRemove={() => onRemoveAssignment(i)}
                    />
                  ))
                )}
              </Section>

              <Section
                title="Effects"
                icon={<AudioWaveform className="size-3.5" />}
                action={<AddBtn label="Add" onClick={() => onAddEffect(target)} />}
              >
                {effects.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground px-1">—</p>
                ) : (
                  effects.map(({ e, i }) => (
                    <EffectSummary
                      key={`e-${i}`}
                      effect={fromCueAdHocEffect(e, library)}
                      palette={cue.palette}
                      actions={
                        <>
                          <TimingBadge
                            delayMs={e.delayMs}
                            intervalMs={e.intervalMs}
                            randomWindowMs={e.randomWindowMs}
                          />
                          <RemoveBtn onClick={() => onRemoveEffect(i)} />
                        </>
                      }
                    />
                  ))
                )}
              </Section>
            </div>
          </div>
        )
      })}
    </div>
  )
}


function ByLayer({
  cue,
  presets,
  library,
  palettes,
  palettesLoaded,
  onRemoveAssignment,
  onRemoveEffect,
  onRemovePreset,
  onAddAssignment,
  onAddEffect,
  onAddPreset,
}: {
  cue: Cue
  presets: FxPreset[] | undefined
  library: EffectLibraryEntry[] | undefined
  /** Keyed by uuid — a stored reference names the palette by uuid, never by id. */
  palettes: ReadonlyMap<string, PaletteSummary>
  palettesLoaded: boolean
  onRemoveAssignment: (index: number) => void
  onRemoveEffect: (index: number) => void
  onRemovePreset: (index: number) => void
  onAddAssignment: () => void
  onAddEffect: () => void
  onAddPreset: () => void
}) {
  return (
    <div className="space-y-4">
      <Section
        title="Presets"
        icon={<Bookmark className="size-3.5" />}
        count={cue.presetApplications.length}
        action={<AddBtn label="Add" onClick={onAddPreset} />}
      >
        {cue.presetApplications.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">
            No presets. Presets are reusable bundles of effects + assignments.
          </p>
        )}
        {cue.presetApplications.map((pa, i) => {
          const fullPreset = presets?.find((p) => p.id === pa.presetId)
          const presetEffects = (fullPreset?.effects ?? []).map((e) =>
            fromPresetEffect(e, library),
          )
          return (
            <PresetApplicationSummary
              key={`pa-${i}`}
              presetName={pa.presetName ?? fullPreset?.name ?? null}
              presetId={pa.presetId}
              effects={presetEffects}
              targets={pa.targets}
              palette={cue.palette}
              actions={
                <>
                  <TimingBadge
                    delayMs={pa.delayMs}
                    intervalMs={pa.intervalMs}
                    randomWindowMs={pa.randomWindowMs}
                  />
                  <RemoveBtn onClick={() => onRemovePreset(i)} />
                </>
              }
            />
          )
        })}
      </Section>

      <Section
        title="Assignments"
        icon={<ListChecks className="size-3.5" />}
        count={cue.propertyAssignments.length}
        action={<AddBtn label="Add" onClick={onAddAssignment} />}
      >
        {cue.propertyAssignments.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">
            No direct assignments. Add a property value (Layer 3 static state).
          </p>
        )}
        {cue.propertyAssignments.map((a, i) => (
          <AssignmentRow
            key={`a-${i}`}
            assignment={a}
            palettes={palettes}
            palettesLoaded={palettesLoaded}
            showTarget
            onRemove={() => onRemoveAssignment(i)}
          />
        ))}
      </Section>

      <Section
        title="Effects"
        icon={<AudioWaveform className="size-3.5" />}
        count={cue.adHocEffects.length}
        action={<AddBtn label="Add" onClick={onAddEffect} />}
      >
        {cue.adHocEffects.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">
            No effects. Effects modulate properties at tempo (Layer 2).
          </p>
        )}
        {cue.adHocEffects.map((e, i) => (
          <EffectSummary
            key={`e-${i}`}
            effect={fromCueAdHocEffect(e, library)}
            target={{ type: e.targetType, key: e.targetKey }}
            palette={cue.palette}
            actions={
              <>
                <TimingBadge
                  delayMs={e.delayMs}
                  intervalMs={e.intervalMs}
                  randomWindowMs={e.randomWindowMs}
                />
                <RemoveBtn onClick={() => onRemoveEffect(i)} />
              </>
            }
          />
        ))}
      </Section>
    </div>
  )
}


function Section({
  title,
  icon,
  count,
  action,
  children,
}: {
  title: string
  icon?: React.ReactNode
  count?: number
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{title}</span>
        {count != null && count > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {count}
          </Badge>
        )}
        <span className="flex-1" />
        {action}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function AssignmentRow({
  assignment,
  palettes,
  palettesLoaded,
  showTarget,
  onRemove,
}: {
  assignment: CuePropertyAssignment
  palettes: ReadonlyMap<string, PaletteSummary>
  palettesLoaded: boolean
  showTarget?: boolean
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded border bg-card text-xs">
      {showTarget && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
          {assignment.targetKey}
        </Badge>
      )}
      <Badge
        variant="outline"
        className="text-[10px] font-mono px-1.5 py-0 shrink-0"
      >
        {assignment.propertyName}
      </Badge>
      <span className="text-muted-foreground">=</span>
      <AssignmentValue
        assignment={assignment}
        palettes={palettes}
        palettesLoaded={palettesLoaded}
      />
      {assignment.fadeDurationMs != null && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
          {(assignment.fadeDurationMs / 1000).toFixed(1)}s
        </Badge>
      )}
      {assignment.moveInDark && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
          MID
        </Badge>
      )}
      <RemoveBtn onClick={onRemove} />
    </div>
  )
}

/**
 * A stored assignment's value: a literal, or the palette it references.
 *
 * The third form of the `value` column, and the one that has to be *un*-encoded for the
 * operator — `ref:8f3c…` on a cue card is a diagnostic string, not a value. A reference whose
 * palette is missing renders as broken rather than as its raw uuid, because the row will be
 * silently skipped when the cue fires and this card is where that has to be visible.
 */
function AssignmentValue({
  assignment,
  palettes,
  palettesLoaded,
}: {
  assignment: CuePropertyAssignment
  palettes: ReadonlyMap<string, PaletteSummary>
  /** False while the palette list is still in flight — see `broken` below. */
  palettesLoaded: boolean
}) {
  const uuid = parsePaletteRefUuid(assignment.value)
  if (uuid == null) {
    return <span className="font-mono truncate flex-1 min-w-0">{assignment.value}</span>
  }
  const palette = palettes.get(uuid)
  const healthNote = describeHealth(assignment.health)
  const health = assignment.health?.type
  // `health` is the server's verdict and leads; the local lookup only adds the case where the
  // palette was deleted since this cue was read. It must be gated on the list having *loaded* —
  // an in-flight query leaves the map empty, and treating that as "missing" paints every healthy
  // reference in the cue destructive-red for as long as the fetch takes.
  const broken =
    health === 'missingPalette' ||
    health === 'missingPaletteEntry' ||
    health === 'paletteTypeMismatch' ||
    (palettesLoaded && palette == null)
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1" title={healthNote ?? undefined}>
      <PaletteRefBadge name={palette?.name} type={palette?.type} missing={broken} />
      {/* The palette's own preview, not a resolved value: the cue read has no per-fixture
          resolution, and a single swatch here would claim to be this row's colour when a
          palette legitimately gives every head a different one. Several chips read as
          "what's in it", which is true. */}
      {palette && !broken && (
        <PalettePreviewRow
          type={palette.type}
          preview={palette.preview.slice(0, 3)}
          className="shrink-0"
        />
      )}
    </span>
  )
}

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-[11px] gap-0.5"
      onClick={onClick}
    >
      <Plus className="size-3" />
      {label}
    </Button>
  )
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-6 text-muted-foreground hover:text-destructive shrink-0"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      aria-label="Remove"
    >
      <X className="size-3.5" />
    </Button>
  )
}

import { useCallback, useMemo, useState } from 'react'
import { AudioWaveform, Layers, ListChecks, Sliders } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { EffectSummary } from '@/components/fx/EffectSummary'
import { TimingBadge } from '@/components/cues/TimingBadge'
import { AddBtn, RemoveBtn, Section } from '@/components/cues/paneChrome'
import { LayerRow, LookStack, type LayerHandlers } from '@/components/looks/LookStack'
import { fromCueAdHocEffect } from '@/components/fx/effectSummaryTypes'
import { useEffectLibraryQuery, type EffectLibraryEntry } from '@/store/fixtureFx'
import { useLookListQuery } from '@/store/looks'
import { usePatchProjectCueMutation } from '@/store/cues'
import { buildCueInput, densifyCueLayerOrder, reorderCueLayers } from '@/lib/cueUtils'
import { AddAssignmentSheet } from './AddAssignmentSheet'
import { AddEffectSheet } from './AddEffectSheet'
import { AddLayerSheet } from '@/components/cues/editor/AddLayerSheet'
import type {
  Cue,
  CueAdHocEffect,
  CueLayer,
  CueLayerDetail,
  CuePropertyAssignment,
  CueTarget,
} from '@/api/cuesApi'
import type { LookSummary } from '@/api/looksApi'

export type LayersMode = 'by-target' | 'by-layer'

interface LayersPaneProps {
  cue: Cue
  projectId: number
  mode: LayersMode
  targets: CueTarget[]
}

/**
 * Renders the cue body — its ordered Look layers, its own assignments and its effects — in either a
 * by-target arrangement (one card per target) or a by-layer arrangement (top-level Layers /
 * Assignments / Effects sections).
 *
 * The layer list is **ordered, and the order is the composition**: layers cook down in `sortOrder`
 * with later winning, and the cue's own assignments are the last layer and beat all of them. That
 * holds for intensity as much as for colour, which is the one thing about this pane an operator
 * coming from the preset era is most likely to be surprised by.
 *
 * All "Add" affordances open right-hand sheets; all removes, reorders and toggles auto-PATCH.
 */
export function LayersPane({ cue, projectId, mode, targets }: LayersPaneProps) {
  const { data: library } = useEffectLibraryQuery()
  const { data: lookList } = useLookListQuery({ projectId })
  const [patchCue] = usePatchProjectCueMutation()

  // Built once for the whole pane and threaded to both arrangements. A per-row lookup would mean
  // one subscription per row, and a cue with forty rows referencing four Looks would fetch the
  // library forty times.
  //
  // There were two maps here until session 4, because the two reference mechanisms addressed a Look
  // differently: a **layer** names it by int id, while a stored `ref:` value named it by uuid. The
  // `ref:` grammar retired, so only the layer's id remains.
  const looksById = useMemo(
    () => new Map((lookList ?? []).map((look) => [look.id, look])),
    [lookList],
  )
  const looksLoaded = lookList != null

  const [addLayerTarget, setAddLayerTarget] = useState<CueTarget | 'any' | null>(null)
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

  const addAssignment = (a: CuePropertyAssignment) => {
    const next = [...(buildCueInput(cue).propertyAssignments ?? []), a]
    patchCue({ projectId, cueId: cue.id, propertyAssignments: next })
  }
  const addEffect = (e: CueAdHocEffect) => {
    const next = [...buildCueInput(cue).adHocEffects, e]
    patchCue({ projectId, cueId: cue.id, adHocEffects: next })
  }

  // ── Layer writes. Every one PATCHes the whole array, because `layers` is replaced wholesale
  // when the key is present — a partial array would delete the rest of the composition.
  const patchLayers = useCallback(
    (layers: CueLayer[]) => {
      patchCue({ projectId, cueId: cue.id, layers })
    },
    [patchCue, projectId, cue.id],
  )

  const removeLayer = (index: number) => {
    // Re-densify: removing layer 1 of three must not leave sortOrder 0 and 2 behind, or a later
    // insert lands in the gap rather than at the end.
    patchLayers(densifyCueLayerOrder(buildCueInput(cue).layers.filter((_, i) => i !== index)))
  }

  const addLayer = (layer: CueLayer) => {
    // Renumbered rather than given `sortOrder: existing.length`, which is only correct when the list
    // arrived dense: a stack that came back as 0, 2 — a migrated cue, or an older client's edit —
    // would give the new layer sortOrder 2 as well, and two layers sharing one leaves the tie to
    // insertion order in the cook step.
    patchLayers(densifyCueLayerOrder([...buildCueInput(cue).layers, layer]))
  }

  const moveLayer = (oldIndex: number, newIndex: number) => {
    patchLayers(reorderCueLayers(buildCueInput(cue).layers, oldIndex, newIndex))
  }

  const setLayerEnabled = (index: number, enabled: boolean) => {
    patchLayers(
      buildCueInput(cue).layers.map((layer, i) => (i === index ? { ...layer, enabled } : layer)),
    )
  }

  const setLayerAmount = (index: number, amount: number) => {
    patchLayers(
      buildCueInput(cue).layers.map((layer, i) => (i === index ? { ...layer, amount } : layer)),
    )
  }

  const setLayerBlendMode = (index: number, blendMode: string) => {
    patchLayers(
      buildCueInput(cue).layers.map((layer, i) => (i === index ? { ...layer, blendMode } : layer)),
    )
  }

  const setLayerPropertyMask = (index: number, propertyMask: string | null) => {
    patchLayers(
      buildCueInput(cue).layers.map((layer, i) => (i === index ? { ...layer, propertyMask } : layer)),
    )
  }

  const layerHandlers: LayerHandlers = {
    onRemove: removeLayer,
    onMove: moveLayer,
    onSetEnabled: setLayerEnabled,
    onSetAmount: setLayerAmount,
    onSetBlendMode: setLayerBlendMode,
    onSetPropertyMask: setLayerPropertyMask,
  }

  const sheets = (
    <>
      <AddAssignmentSheet
        open={addAssignmentTarget != null}
        onOpenChange={(open) => {
          if (!open) setAddAssignmentTarget(null)
        }}
        cue={cue}
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
      <AddLayerSheet
        open={addLayerTarget != null}
        onOpenChange={(open) => {
          if (!open) setAddLayerTarget(null)
        }}
        projectId={projectId}
        defaultTarget={addLayerTarget === 'any' ? null : addLayerTarget}
        onAdd={(layer) => {
          addLayer(layer)
          setAddLayerTarget(null)
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
          looksById={looksById}
          looksLoaded={looksLoaded}
          library={library}
          layerHandlers={layerHandlers}
          onRemoveAssignment={removeAssignment}
          onRemoveEffect={removeEffect}
          onAddAssignment={setAddAssignmentTarget}
          onAddEffect={setAddEffectTarget}
          onAddLayer={setAddLayerTarget}
        />
      ) : (
        <ByLayer
          cue={cue}
          looksById={looksById}
          looksLoaded={looksLoaded}
          library={library}
          layerHandlers={layerHandlers}
          onRemoveAssignment={removeAssignment}
          onRemoveEffect={removeEffect}
          onAddAssignment={() => setAddAssignmentTarget('any')}
          onAddEffect={() => setAddEffectTarget('any')}
          onAddLayer={() => setAddLayerTarget('any')}
        />
      )}
      {sheets}
    </>
  )
}

interface LookIndexes {
  /** Keyed by int id — how a **layer** names its Look. */
  looksById: ReadonlyMap<number, LookSummary>
  looksLoaded: boolean
}

function ByTarget({
  cue,
  targets,
  looksById,
  looksLoaded,
  library,
  layerHandlers,
  onRemoveAssignment,
  onRemoveEffect,
  onAddAssignment,
  onAddEffect,
  onAddLayer,
}: LookIndexes & {
  cue: Cue
  targets: CueTarget[]
  library: EffectLibraryEntry[] | undefined
  layerHandlers: LayerHandlers
  onRemoveAssignment: (index: number) => void
  onRemoveEffect: (index: number) => void
  onAddAssignment: (target: CueTarget) => void
  onAddEffect: (target: CueTarget) => void
  onAddLayer: (target: CueTarget) => void
}) {
  const buckets = useMemo(() => {
    const map = new Map<
      string,
      {
        assignments: { a: CuePropertyAssignment; i: number }[]
        effects: { e: CueAdHocEffect; i: number }[]
        layers: { layer: CueLayerDetail; i: number }[]
      }
    >()
    const bucket = (key: string) => {
      let b = map.get(key)
      if (!b) {
        b = { assignments: [], effects: [], layers: [] }
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
    // A layer with no explicit targets uses the Look's own, which this view has no way to expand,
    // so it appears under no target here. `by-layer` is where it is visible — the section header
    // below says so rather than letting it silently vanish.
    cue.layers.forEach((layer, i) => {
      for (const t of layer.targets) bucket(`${t.type}:${t.key}`).layers.push({ layer, i })
    })
    return map
  }, [cue])

  const unscopedLayerCount = useMemo(
    () => cue.layers.filter((layer) => layer.targets.length === 0).length,
    [cue.layers],
  )

  if (targets.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">No targets on this cue.</p>
  }

  return (
    <div className="space-y-3">
      {unscopedLayerCount > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {unscopedLayerCount} layer{unscopedLayerCount === 1 ? '' : 's'} name no targets of their
          own and use the look&rsquo;s — switch to the layer view to see {unscopedLayerCount === 1 ? 'it' : 'them'}.
        </p>
      )}
      {targets.map((target) => {
        const { assignments, effects, layers } = buckets.get(`${target.type}:${target.key}`) ?? {
          assignments: [],
          effects: [],
          layers: [],
        }

        return (
          <div
            key={`${target.type}:${target.key}`}
            className={cn(
              'rounded-lg border bg-card overflow-hidden',
              target.type === 'fixture' ? 'border-amber-500/30' : 'border-blue-500/30',
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
                {assignments.length + effects.length + layers.length} item
                {assignments.length + effects.length + layers.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="p-2 space-y-3">
              <Section
                title="Layers"
                icon={<Layers className="size-3.5" />}
                action={<AddBtn label="Add" onClick={() => onAddLayer(target)} />}
              >
                {layers.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground px-1">—</p>
                ) : (
                  layers.map(({ layer, i }) => (
                    <LayerRow
                      key={`layer-${i}`}
                      layer={layer}
                      index={i}
                      look={looksById.get(layer.lookId)}
                      looksLoaded={looksLoaded}
                      handlers={layerHandlers}
                      // No drag handle in the by-target view: the order is a property of the cue,
                      // not of this target, and a list filtered to one target cannot express it.
                      sortable={false}
                    />
                  ))
                )}
              </Section>

              <Section
                title="Assignments"
                icon={<Sliders className="size-3.5" />}
                action={<AddBtn label="Add" onClick={() => onAddAssignment(target)} />}
              >
                {assignments.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground px-1">—</p>
                ) : (
                  assignments.map(({ a, i }) => (
                    <AssignmentRow
                      key={`a-${i}`}
                      assignment={a}
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
  looksById,
  looksLoaded,
  library,
  layerHandlers,
  onRemoveAssignment,
  onRemoveEffect,
  onAddAssignment,
  onAddEffect,
  onAddLayer,
}: LookIndexes & {
  cue: Cue
  library: EffectLibraryEntry[] | undefined
  layerHandlers: LayerHandlers
  onRemoveAssignment: (index: number) => void
  onRemoveEffect: (index: number) => void
  onAddAssignment: () => void
  onAddEffect: () => void
  onAddLayer: () => void
}) {
  return (
    <div className="space-y-4">
      <LookStack
        layers={cue.layers}
        looksById={looksById}
        looksLoaded={looksLoaded}
        handlers={layerHandlers}
        onAdd={onAddLayer}
        emptyNote="No layers. A layer applies a look at a position in this cue’s stack."
        precedenceNote={
          <>
            Later layers win, and this cue&rsquo;s own assignments win over all of them &mdash; for
            every attribute, intensity included.
          </>
        }
      />

      <Section
        title="Assignments"
        icon={<ListChecks className="size-3.5" />}
        count={cue.propertyAssignments.length}
        action={<AddBtn label="Add" onClick={onAddAssignment} />}
      >
        {cue.propertyAssignments.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">
            No direct assignments. Add a property value — this cue&rsquo;s local layer, which wins
            over every look above.
          </p>
        )}
        {cue.propertyAssignments.map((a, i) => (
          <AssignmentRow
            key={`a-${i}`}
            assignment={a}
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

function AssignmentRow({
  assignment,
  showTarget,
  onRemove,
}: {
  assignment: CuePropertyAssignment
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
      <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 shrink-0">
        {assignment.propertyName}
      </Badge>
      <span className="text-muted-foreground">=</span>
      <AssignmentValue assignment={assignment} />
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
 * A stored assignment's value.
 *
 * Always a literal now, so this is a one-line render. It used to un-encode the *other* form of the
 * `value` column for the operator: `ref:8f3c…` is a diagnostic string rather than a value, so a
 * reference rendered as its Look's name plus a few preview swatches, and as broken when the Look had
 * been deleted since the cue was read. The `ref:` value grammar retired in session 4, and a layer
 * with a `propertyMask` is what expresses "this property comes from that Look" instead — which the
 * Layers section above renders.
 */
function AssignmentValue({ assignment }: { assignment: CuePropertyAssignment }) {
  return <span className="font-mono truncate flex-1 min-w-0">{assignment.value}</span>
}

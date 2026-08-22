import { useCallback, useMemo, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AudioWaveform,
  Ban,
  Eye,
  GripVertical,
  Layers,
  ListChecks,
  Plus,
  Sliders,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { EffectSummary } from '@/components/fx/EffectSummary'
import { TimingBadge } from '@/components/cues/TimingBadge'
import { fromCueAdHocEffect } from '@/components/fx/effectSummaryTypes'
import { useEffectLibraryQuery, type EffectLibraryEntry } from '@/store/fixtureFx'
import { useLookListQuery } from '@/store/looks'
import { usePatchProjectCueMutation } from '@/store/cues'
import { buildCueInput, reorderCueLayers } from '@/lib/cueUtils'
import { FAMILY_LABELS } from '@/lib/attributeFamily'
import { LookRefBadge } from '@/components/looks/LookRefBadge'
import { LookPreviewSwatches } from '@/components/looks/lookRefValue'
import { parsePaletteRefUuid } from '@/lib/programmerValue'
import { describeHealth } from '@/lib/healthDescriptor'
import { AddAssignmentSheet } from './AddAssignmentSheet'
import { AddEffectSheet } from './AddEffectSheet'
import { AddLayerSheet } from './AddLayerSheet'
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

  // Both indexes are built once for the whole pane and threaded to both arrangements. A per-row
  // lookup would mean one subscription per row, and a cue with forty rows referencing four Looks
  // would fetch the library forty times.
  //
  // Two maps because the two reference mechanisms address a Look differently: a **layer** names it
  // by int id, while a stored `ref:` value names it by uuid (int PKs are re-minted on sync import,
  // so a value can never hold one).
  const looksByUuid = useMemo(
    () => new Map((lookList ?? []).map((look) => [look.uuid, look])),
    [lookList],
  )
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
    patchLayers(reorderCueLayers(buildCueInput(cue).layers.filter((_, i) => i !== index), 0, 0))
  }

  const addLayer = (layer: CueLayer) => {
    // Through `reorderCueLayers` rather than `sortOrder: existing.length`, which is only correct
    // when the list arrived dense: a stack that came back as 0, 2 — a migrated cue, or an older
    // client's edit — would give the new layer sortOrder 2 as well, and two layers sharing one
    // leaves the tie to insertion order in the cook step.
    patchLayers(reorderCueLayers([...buildCueInput(cue).layers, layer], 0, 0))
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

  const layerHandlers: LayerHandlers = {
    onRemove: removeLayer,
    onMove: moveLayer,
    onSetEnabled: setLayerEnabled,
    onSetAmount: setLayerAmount,
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
          looksByUuid={looksByUuid}
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
          looksByUuid={looksByUuid}
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

/** The four layer mutations, bundled so both arrangements take one prop rather than four. */
interface LayerHandlers {
  onRemove: (index: number) => void
  onMove: (oldIndex: number, newIndex: number) => void
  onSetEnabled: (index: number, enabled: boolean) => void
  onSetAmount: (index: number, amount: number) => void
}

interface LookIndexes {
  /** Keyed by int id — how a **layer** names its Look. */
  looksById: ReadonlyMap<number, LookSummary>
  /** Keyed by uuid — how a stored `ref:` value names one. */
  looksByUuid: ReadonlyMap<string, LookSummary>
  looksLoaded: boolean
}

function ByTarget({
  cue,
  targets,
  looksById,
  looksByUuid,
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
                      looksByUuid={looksByUuid}
                      looksLoaded={looksLoaded}
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
  looksByUuid,
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  // Index-derived ids. They only have to be stable for the duration of one drag, and the list
  // cannot change mid-drag; a layer carries no uuid on the wire, and `lookId` is not unique —
  // one cue may legitimately layer the same Look twice, at two delays.
  const ids = useMemo(() => cue.layers.map((_, i) => `layer-${i}`), [cue.layers])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIndex = ids.indexOf(String(active.id))
      const newIndex = ids.indexOf(String(over.id))
      if (oldIndex === -1 || newIndex === -1) return
      layerHandlers.onMove(oldIndex, newIndex)
    },
    [ids, layerHandlers],
  )

  return (
    <div className="space-y-4">
      <Section
        title="Layers"
        icon={<Layers className="size-3.5" />}
        count={cue.layers.length}
        action={<AddBtn label="Add" onClick={onAddLayer} />}
      >
        {cue.layers.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No layers. A layer applies a look at a position in this cue&rsquo;s stack.
          </p>
        ) : (
          <>
            {/* Stated, not implied: the order is the composition, and it is the same rule for
                intensity as for colour. Operators arriving from presets expect HTP here. */}
            <p className="text-[11px] text-muted-foreground">
              Later layers win, and this cue&rsquo;s own assignments win over all of them — for
              every attribute, intensity included.
            </p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                {cue.layers.map((layer, i) => (
                  <LayerRow
                    key={ids[i]}
                    sortableId={ids[i]}
                    layer={layer}
                    index={i}
                    look={looksById.get(layer.lookId)}
                    looksLoaded={looksLoaded}
                    handlers={layerHandlers}
                    sortable
                    showTargets
                  />
                ))}
              </SortableContext>
            </DndContext>
          </>
        )}
      </Section>

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
            looksByUuid={looksByUuid}
            looksLoaded={looksLoaded}
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

/**
 * One line of the cue's Look composition.
 *
 * Editable here: order, enabled, amount. `propertyMask`, `blendMode` and `stomp` render read-only
 * — the migration sets a mask on every layer folded from a value-level reference, so hiding it
 * would leave an operator unable to see why a layer only moves colour, but the controls for
 * editing them are a later session.
 */
function LayerRow({
  layer,
  index,
  look,
  looksLoaded,
  handlers,
  sortable,
  sortableId,
  showTargets,
}: {
  layer: CueLayerDetail
  index: number
  look: LookSummary | undefined
  looksLoaded: boolean
  handlers: LayerHandlers
  sortable: boolean
  sortableId?: string
  showTargets?: boolean
}) {
  const enabled = layer.enabled !== false
  // `lookName` comes with the read, so a layer is labelled even before the library list lands. The
  // local lookup only adds the families and the deleted-since-read case.
  const name = layer.lookName ?? look?.name
  const missing = looksLoaded && look == null

  return (
    <SortableShell sortable={sortable} sortableId={sortableId}>
      {(dragHandle) => (
        <div
          className={cn(
            'flex flex-wrap items-center gap-2 rounded border bg-card p-2 text-xs',
            !enabled && 'opacity-60',
          )}
        >
          {dragHandle}
          <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px] font-mono">
            {index + 1}
          </Badge>
          <LookRefBadge name={name} missing={missing} />

          {look?.families.map((family) => (
            <Badge key={family} variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
              {FAMILY_LABELS[family].singular}
            </Badge>
          ))}

          {layer.propertyMask && (
            <Badge
              variant="outline"
              className="shrink-0 px-1.5 py-0 text-[10px]"
              title="This layer only asserts these attribute families"
            >
              [{layer.propertyMask}]
            </Badge>
          )}

          {layer.blendMode && layer.blendMode !== 'OVERRIDE' && (
            <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
              {layer.blendMode}
            </Badge>
          )}

          {layer.stomp && (
            <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]" title="Stomps other effects">
              STOMP
            </Badge>
          )}

          {showTargets && (
            <span className="flex min-w-0 flex-wrap items-center gap-1">
              {layer.targets.length === 0 ? (
                <span
                  className="text-[10px] text-muted-foreground"
                  title="No targets on the layer, so the look's own rows decide where it lands"
                >
                  look&rsquo;s own targets
                </span>
              ) : (
                layer.targets.map((t) => (
                  <Badge
                    key={`${t.type}:${t.key}`}
                    variant="outline"
                    className="shrink-0 px-1.5 py-0 text-[10px]"
                  >
                    {t.key}
                  </Badge>
                ))
              )}
            </span>
          )}

          <span className="flex-1" />

          <AmountInput
            value={layer.amount ?? 1}
            onCommit={(amount) => handlers.onSetAmount(index, amount)}
          />
          <TimingBadge
            delayMs={layer.delayMs}
            intervalMs={layer.intervalMs}
            randomWindowMs={layer.randomWindowMs}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-muted-foreground"
            aria-label={enabled ? 'Disable layer' : 'Enable layer'}
            aria-pressed={!enabled}
            title={enabled ? 'Disable this layer' : 'Enable this layer'}
            onClick={() => handlers.onSetEnabled(index, !enabled)}
          >
            {enabled ? <Eye className="size-3.5" /> : <Ban className="size-3.5" />}
          </Button>
          <RemoveBtn onClick={() => handlers.onRemove(index)} />
        </div>
      )}
    </SortableShell>
  )
}

/**
 * Wraps a row in `useSortable` when it is orderable, and in nothing when it isn't.
 *
 * A component rather than a conditional call, because `useSortable` is a hook: calling it only in
 * the by-layer arrangement would break the rules of hooks, and calling it always would register
 * by-target rows with a `SortableContext` that isn't there.
 */
function SortableShell({
  sortable,
  sortableId,
  children,
}: {
  sortable: boolean
  sortableId?: string
  children: (dragHandle: React.ReactNode) => React.ReactNode
}) {
  if (!sortable || sortableId == null) return <>{children(null)}</>
  return <SortableRow sortableId={sortableId}>{children}</SortableRow>
}

function SortableRow({
  sortableId,
  children,
}: {
  sortableId: string
  children: (dragHandle: React.ReactNode) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  }
  // Listeners go on the handle only, never the row: the row carries controls, and a drag that
  // starts on the amount field would make it un-typeable.
  const handle = (
    <button
      type="button"
      className="shrink-0 cursor-grab text-muted-foreground hover:text-foreground"
      aria-label="Reorder layer"
      onClick={(e) => e.stopPropagation()}
      {...listeners}
    >
      <GripVertical className="size-3.5" />
    </button>
  )
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children(handle)}
    </div>
  )
}

/**
 * A layer's amount, as a percentage.
 *
 * Held as local draft text and committed on blur or Enter rather than per keystroke: every commit
 * is a PATCH of the whole cue, and typing "50" would otherwise fire one for "5" on the way.
 */
function AmountInput({
  value,
  onCommit,
}: {
  value: number
  onCommit: (amount: number) => void
}) {
  const asPercent = Math.round(value * 100)
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    if (draft == null) return
    const parsed = Number(draft)
    setDraft(null)
    // `Number('')` is 0, so a blank field would commit 0% and silently mute the layer. An emptied
    // box means "I haven't decided", not "none of it".
    if (draft.trim() === '' || !Number.isFinite(parsed)) return
    const clamped = Math.min(100, Math.max(0, Math.round(parsed))) / 100
    if (clamped === value) return
    onCommit(clamped)
  }

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <Input
        type="number"
        min={0}
        max={100}
        aria-label="Layer amount (%)"
        className="h-6 w-14 px-1 text-right text-[11px]"
        value={draft ?? String(asPercent)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setDraft(null)
        }}
      />
      <span className="text-[10px] text-muted-foreground">%</span>
    </span>
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
  looksByUuid,
  looksLoaded,
  showTarget,
  onRemove,
}: {
  assignment: CuePropertyAssignment
  looksByUuid: ReadonlyMap<string, LookSummary>
  looksLoaded: boolean
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
      <AssignmentValue
        assignment={assignment}
        looksByUuid={looksByUuid}
        looksLoaded={looksLoaded}
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
 * A stored assignment's value: a literal, or the Look it references.
 *
 * The second form of the `value` column, and the one that has to be *un*-encoded for the operator —
 * `ref:8f3c…` on a cue card is a diagnostic string, not a value. A reference whose Look is missing
 * renders as broken rather than as its raw uuid, because the row will be silently skipped when the
 * cue fires and this card is where that has to be visible.
 *
 * Nothing authors one of these any more; a layer with a `propertyMask` is what replaces it. This
 * renders the rows that already exist.
 */
function AssignmentValue({
  assignment,
  looksByUuid,
  looksLoaded,
}: {
  assignment: CuePropertyAssignment
  looksByUuid: ReadonlyMap<string, LookSummary>
  /** False while the look list is still in flight — see `broken` below. */
  looksLoaded: boolean
}) {
  const uuid = parsePaletteRefUuid(assignment.value)
  if (uuid == null) {
    return <span className="font-mono truncate flex-1 min-w-0">{assignment.value}</span>
  }
  const look = looksByUuid.get(uuid)
  const healthNote = describeHealth(assignment.health)
  const health = assignment.health?.type
  // `health` is the server's verdict and leads; the local lookup only adds the case where the Look
  // was deleted since this cue was read. It must be gated on the list having *loaded* — an
  // in-flight query leaves the map empty, and treating that as "missing" paints every healthy
  // reference in the cue destructive-red for as long as the fetch takes.
  const broken =
    health === 'missingPalette' ||
    health === 'missingPaletteEntry' ||
    (looksLoaded && look == null)
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1" title={healthNote ?? undefined}>
      <LookRefBadge name={look?.name} missing={broken} />
      {/* The Look's own preview, not a resolved value: the cue read has no per-fixture resolution,
          and a single swatch here would claim to be this row's colour when a Look legitimately
          gives every head a different one. Several chips read as "what's in it", which is true. */}
      {look && !broken && (
        <LookPreviewSwatches preview={look.preview.slice(0, 3)} className="shrink-0" />
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

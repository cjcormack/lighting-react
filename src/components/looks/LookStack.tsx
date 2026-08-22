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
import { Ban, Eye, GripVertical, Layers } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { TimingBadge } from '@/components/cues/TimingBadge'
import { AddBtn, RemoveBtn, Section } from '@/components/cues/paneChrome'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BLEND_MODE_OPTIONS } from '@/components/fx/fxConstants'
import { MaskPicker } from '@/components/programmer/maskPicker'
import {
  FAMILY_LABELS,
  parsePropertyMask,
  serializePropertyMask,
} from '@/lib/attributeFamily'
import { LookNameBadge } from '@/components/looks/LookNameBadge'
import type { CueTarget } from '@/api/cuesApi'
import type { LookSummary } from '@/api/looksApi'

/**
 * One line of a Look composition, in the shape both consumers already have.
 *
 * A structural supertype rather than a union, so neither side converts: a cue's `CueLayerDetail`
 * and the programmer's `ProgrammerLayer` both satisfy it as they come off the wire. The timing
 * fields are optional because a **programmer** layer has none — it fires now, by definition —
 * while a cue layer can be delayed or recurring.
 */
export interface LookStackLayer {
  lookId: number
  lookName?: string | null
  enabled?: boolean
  targets: CueTarget[]
  propertyMask?: string | null
  blendMode?: string
  amount?: number
  stomp?: boolean
  delayMs?: number | null
  intervalMs?: number | null
  randomWindowMs?: number | null
}

/**
 * The layer mutations, bundled so a consumer passes one prop rather than six.
 *
 * **Index-based on purpose**, even though the programmer's ops address a layer by `layerId`: the
 * rows render a list and the operator acts on a position in it. Translating index → id is the
 * consumer's job, and it is the consumer that knows whether its list was filtered.
 *
 * `onSetStomp` is deliberately absent. The wire carries `stomp` and has since session 3a, but
 * nothing *reads* it — within-cue stomp needs an `FxInstance` layer id, a suppression channel out of
 * the cook step and per-tick suppression at four spawn sites, none of which exist. A toggle here
 * would write a field the engine ignores, so the badge stays read-only until the engine honours it.
 */
export interface LayerHandlers {
  onRemove: (index: number) => void
  onMove: (oldIndex: number, newIndex: number) => void
  onSetEnabled: (index: number, enabled: boolean) => void
  onSetAmount: (index: number, amount: number) => void
  onSetBlendMode: (index: number, blendMode: string) => void
  onSetPropertyMask: (index: number, propertyMask: string | null) => void
}

interface LookStackProps<T extends LookStackLayer> {
  layers: readonly T[]
  /** Keyed by int id — how a layer names its Look. Adds the families and the deleted-since case. */
  looksById: ReadonlyMap<number, LookSummary>
  /** False while the look list is in flight, so a layer is never painted as missing mid-fetch. */
  looksLoaded: boolean
  handlers: LayerHandlers
  onAdd: () => void
  /**
   * The one-line statement of what the order means. A prop rather than fixed copy because the two
   * consumers' *last* layer differs — a cue's own assignments, the operator's own programmer
   * values — and naming the wrong one would be worse than saying nothing.
   */
  precedenceNote: React.ReactNode
  emptyNote: React.ReactNode
  /** Rendered under the list. The programmer puts its read-only preview layer here. */
  footer?: React.ReactNode
  /**
   * Stable dnd-kit id per row. Defaults to the index, which is all a cue can offer — a layer
   * carries no uuid on the wire and `lookId` is not unique, since one cue may legitimately layer
   * the same Look twice at two delays. The programmer passes its `layerId`, which is better: its
   * layer state is a *broadcast*, so another tab's reorder can land between renders and
   * index-derived ids would reshuffle underneath the drag.
   */
  keyFor?: (layer: T, index: number) => string
}

/**
 * An ordered, reorderable list of Look layers — the §4.1 `LookStack`, shared unchanged by the cue
 * editor and the programmer.
 *
 * That sharing is the point rather than a saving: a cue *is* a saved programmer stack, so a layer
 * list that looked different in the two places would be describing one structure twice.
 *
 * Editable here: order, enabled, amount, blend mode and property mask. `stomp` still renders
 * read-only — see [LayerHandlers] for why a toggle would be a lie.
 *
 * Blend and mask sit behind a per-row popover rather than inline. The row is a `text-xs` flex line of
 * `size-6` controls; an `h-8` select plus four checkboxes would not fit beside them, and a layer's
 * blend is set once and then read many times, unlike its amount.
 */
export function LookStack<T extends LookStackLayer>({
  layers,
  looksById,
  looksLoaded,
  handlers,
  onAdd,
  precedenceNote,
  emptyNote,
  footer,
  keyFor,
}: LookStackProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const ids = useMemo(
    () => layers.map((layer, i) => keyFor?.(layer, i) ?? `layer-${i}`),
    [layers, keyFor],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIndex = ids.indexOf(String(active.id))
      const newIndex = ids.indexOf(String(over.id))
      if (oldIndex === -1 || newIndex === -1) return
      handlers.onMove(oldIndex, newIndex)
    },
    [ids, handlers],
  )

  return (
    <Section
      title="Layers"
      icon={<Layers className="size-3.5" />}
      count={layers.length}
      action={<AddBtn label="Add" onClick={onAdd} />}
    >
      {layers.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">{emptyNote}</p>
      ) : (
        <>
          {/* Stated, not implied: the order is the composition, and it is the same rule for
              intensity as for colour. Operators arriving from presets expect HTP here. */}
          <p className="text-[11px] text-muted-foreground">{precedenceNote}</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {layers.map((layer, i) => (
                <LayerRow
                  key={ids[i]}
                  sortableId={ids[i]}
                  layer={layer}
                  index={i}
                  look={looksById.get(layer.lookId)}
                  looksLoaded={looksLoaded}
                  handlers={handlers}
                  sortable
                  showTargets
                />
              ))}
            </SortableContext>
          </DndContext>
        </>
      )}
      {footer}
    </Section>
  )
}

/**
 * One line of a Look composition.
 *
 * Exported because the cue editor's by-target arrangement renders these outside a stack, with
 * `sortable={false}`: the order is a property of the cue, not of one target, and a list filtered to
 * a single target cannot express it.
 */
export function LayerRow({
  layer,
  index,
  look,
  looksLoaded,
  handlers,
  sortable,
  sortableId,
  showTargets,
  readOnly,
}: {
  layer: LookStackLayer
  index: number
  look: LookSummary | undefined
  looksLoaded: boolean
  /**
   * Optional so a `readOnly` caller doesn't have to invent four no-ops it can never call — the read
   * surface (`CueDetailContent`) renders these rows and has nothing to mutate.
   */
  handlers?: LayerHandlers
  sortable: boolean
  sortableId?: string
  showTargets?: boolean
  /** Renders the row without its amount field, enable toggle or remove button. */
  readOnly?: boolean
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
          <LookNameBadge name={name} missing={missing} />

          {look?.families.map((family) => (
            <Badge key={family} variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
              {FAMILY_LABELS[family].singular}
            </Badge>
          ))}

          {readOnly ? (
            <>
              {layer.propertyMask && (
                <Badge
                  variant="outline"
                  className="shrink-0 px-1.5 py-0 text-[10px]"
                  title="This layer only asserts these attribute families"
                >
                  {/* The same label the editable trigger shows, not the raw wire string. Wording one
                      surface `[COLOUR]` and the other `[Colour]` would undo the reason this row is
                      shared between them. */}
                  [{parsePropertyMask(layer.propertyMask)
                    .map((f) => FAMILY_LABELS[f].singular)
                    .join(', ')}]
                </Badge>
              )}
              {layer.blendMode && layer.blendMode !== 'OVERRIDE' && (
                <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
                  {layer.blendMode}
                </Badge>
              )}
            </>
          ) : (
            <LayerBlendMaskPopover
              blendMode={layer.blendMode ?? 'OVERRIDE'}
              propertyMask={layer.propertyMask ?? null}
              onSetBlendMode={(mode) => handlers?.onSetBlendMode(index, mode)}
              onSetPropertyMask={(mask) => handlers?.onSetPropertyMask(index, mask)}
            />
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

          {!readOnly && (
            <AmountInput
              value={layer.amount ?? 1}
              onCommit={(amount) => handlers?.onSetAmount(index, amount)}
            />
          )}
          <TimingBadge
            delayMs={layer.delayMs}
            intervalMs={layer.intervalMs}
            randomWindowMs={layer.randomWindowMs}
          />
          {!readOnly && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 text-muted-foreground"
                aria-label={enabled ? 'Disable layer' : 'Enable layer'}
                aria-pressed={!enabled}
                title={enabled ? 'Disable this layer' : 'Enable this layer'}
                onClick={() => handlers?.onSetEnabled(index, !enabled)}
              >
                {enabled ? <Eye className="size-3.5" /> : <Ban className="size-3.5" />}
              </Button>
              <RemoveBtn onClick={() => handlers?.onRemove(index)} />
            </>
          )}
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
 * A layer's blend mode and property mask, behind one trigger.
 *
 * Grouped rather than inline, and grouped *together* rather than as two triggers, because they are
 * the two answers to "how does this layer combine": the mask says which attributes it touches at
 * all, the blend says what it does with them. Amount stays on the row because it is the one an
 * operator reaches for repeatedly, and it already has a control shaped for a `text-xs` line.
 *
 * The trigger doubles as the read-out, so a masked or non-default layer still explains itself at a
 * glance — that was the whole reason the badges it replaces rendered read-only.
 */
function LayerBlendMaskPopover({
  blendMode,
  propertyMask,
  onSetBlendMode,
  onSetPropertyMask,
}: {
  blendMode: string
  propertyMask: string | null
  onSetBlendMode: (blendMode: string) => void
  onSetPropertyMask: (propertyMask: string | null) => void
}) {
  const families = parsePropertyMask(propertyMask)
  const masked = families.length > 0
  const nonDefaultBlend = blendMode !== 'OVERRIDE'
  const label = masked
    ? `[${families.map((f) => FAMILY_LABELS[f].singular).join(', ')}]`
    : nonDefaultBlend
      ? blendMode
      : 'Mix'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'h-6 shrink-0 px-1.5 text-[10px]',
            masked || nonDefaultBlend ? 'text-foreground' : 'text-muted-foreground',
          )}
          title="How this layer combines: which attribute families it asserts, and its blend mode"
        >
          {label}
          {masked && nonDefaultBlend && <span className="ml-1 opacity-70">{blendMode}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Blend mode</Label>
          <Select value={blendMode} onValueChange={onSetBlendMode}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BLEND_MODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span className="flex flex-col">
                    <span>{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Asserts</Label>
          {/* `MaskPicker` speaks families and the wire speaks a comma-separated string; the
              adapter normalises both "none selected" and "all four selected" to null, so an
              unmasked layer has exactly one representation. */}
          <MaskPicker
            value={families}
            onChange={(next) => onSetPropertyMask(serializePropertyMask(next))}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * A layer's amount, as a percentage.
 *
 * Held as local draft text and committed on blur or Enter rather than per keystroke: a cue commit
 * PATCHes the whole cue and a programmer commit is a WS op per layer, so typing "50" would
 * otherwise fire one for "5" on the way.
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

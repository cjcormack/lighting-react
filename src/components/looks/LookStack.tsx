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
import { Ban, Eye, Footprints, GripVertical, Layers } from 'lucide-react'
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
import type { TemplateSummary } from '@/api/templatesApi'
import type { LayerSource } from '@/api/cuesApi'
import type { AttributeFamily } from '@/lib/attributeFamily'

/**
 * One line of a Look composition, in the shape both consumers already have.
 *
 * A structural supertype rather than a union, so neither side converts: a cue's `CueLayerDetail`
 * and the programmer's `ProgrammerLayer` both satisfy it as they come off the wire. The timing
 * fields are optional because a **programmer** layer has none — it fires now, by definition —
 * while a cue layer can be delayed or recurring.
 */
export interface LookStackLayer {
  /**
   * What this layer applies — a Look or a template.
   *
   * Null only for a row the server could not resolve, which the row draws as missing. It replaces
   * the `lookId` / `lookName` pair: a layer's referent is polymorphic since session 3, and the two
   * kinds want different iconography and a different library to look up.
   */
  source?: LayerSource | null
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
 * The layer mutations, bundled so a consumer passes one prop rather than seven.
 *
 * **Index-based on purpose**, even though the programmer's ops address a layer by `layerId`: the
 * rows render a list and the operator acts on a position in it. Translating index → id is the
 * consumer's job, and it is the consumer that knows whether its list was filtered.
 *
 * `onSetStomp` is the escape hatch for the one thing layer order cannot express: effects are
 * Layer 3 and values are Layer 4, so a lower layer's colour effect beats a higher layer's static
 * colour whatever the order says. Setting it makes this layer switch off the layers *below* it on
 * every property it asserts — coarse on purpose, and suppression rather than removal, so clearing
 * it brings those effects back with their phase intact. It was read-only until the engine honoured
 * the field; both halves landed together, because a toggle writing a field the engine ignores is
 * worse than no toggle.
 */
export interface LayerHandlers {
  onRemove: (index: number) => void
  onMove: (oldIndex: number, newIndex: number) => void
  onSetEnabled: (index: number, enabled: boolean) => void
  onSetAmount: (index: number, amount: number) => void
  onSetBlendMode: (index: number, blendMode: string) => void
  onSetPropertyMask: (index: number, propertyMask: string | null) => void
  onSetStomp: (index: number, stomp: boolean) => void
  /**
   * Point the value grid at this layer's Look.
   *
   * **Optional**, unlike the seven above, and the asymmetry is deliberate: focusing is a property
   * of the *programmer*, which has a grid beside the stack to point somewhere. The cue editor's
   * rows and the Look editor's preview row have nothing to focus, and giving them a no-op to pass
   * would put a dead affordance on every read-only surface that renders a `LayerRow`.
   */
  onFocus?: (index: number) => void
}

interface LookStackProps<T extends LookStackLayer> {
  layers: readonly T[]
  /** Keyed by int id — how a layer names its Look. Adds the families and the deleted-since case. */
  looksById: ReadonlyMap<number, LookSummary>
  /**
   * The same, for template layers. Separate maps rather than one keyed by `${kind}:${id}` because
   * the two ids come from different tables and can collide — and because a caller that has only one
   * library loaded should not have to fake the other.
   */
  templatesById?: ReadonlyMap<number, TemplateSummary>
  /** False while the libraries are in flight, so a layer is never painted as missing mid-fetch. */
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
  /** Which row the value grid is pointed at, if any. Ringed rather than selected-looking. */
  focusedIndex?: number | null
}

/**
 * An ordered, reorderable list of Look layers — the §4.1 `LookStack`, shared unchanged by the cue
 * editor and the programmer.
 *
 * That sharing is the point rather than a saving: a cue *is* a saved programmer stack, so a layer
 * list that looked different in the two places would be describing one structure twice.
 *
 * Editable here: order, enabled, amount, blend mode, property mask and stomp. A read-only row
 * (the Look editor's live preview, a cue's detail sheet) drops the amount field, the enable toggle
 * and the remove button, and redraws mask, blend and stomp as badges — see [LayerHandlers] for what
 * stomp means.
 *
 * Blend and mask sit behind a per-row popover rather than inline. The row is a `text-xs` flex line of
 * `size-6` controls; an `h-8` select plus four checkboxes would not fit beside them, and a layer's
 * blend is set once and then read many times, unlike its amount.
 */
export function LookStack<T extends LookStackLayer>({
  layers,
  looksById,
  templatesById,
  looksLoaded,
  handlers,
  onAdd,
  precedenceNote,
  emptyNote,
  footer,
  keyFor,
  focusedIndex,
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
                  info={describeStackSource(layer.source, looksById, templatesById, looksLoaded)}
                  handlers={handlers}
                  sortable
                  showTargets
                  focused={focusedIndex === i}
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
 * What a row needs to know about the thing its layer applies.
 *
 * Resolved once, in one place, because the answer comes from two different libraries and three
 * different sources: the layer's own `source.name` (which arrives with the read, so a row is
 * labelled before either library lands), the library entry (which adds the families and the
 * deleted-since case) and the kind (which decides the badge).
 */
export interface StackSourceInfo {
  name: string | undefined
  families: readonly AttributeFamily[]
  /** The library has loaded and does not hold it — the row draws as missing. */
  missing: boolean
  isTemplate: boolean
}

export function describeStackSource(
  source: LayerSource | null | undefined,
  looksById: ReadonlyMap<number, LookSummary>,
  templatesById: ReadonlyMap<number, TemplateSummary> | undefined,
  librariesLoaded: boolean,
): StackSourceInfo {
  if (source == null) {
    return { name: undefined, families: [], missing: librariesLoaded, isTemplate: false }
  }
  if (source.kind === 'TEMPLATE') {
    const template = templatesById?.get(source.id)
    return {
      name: source.name ?? template?.name,
      // A template is in exactly one family, and it is derived from its rows the same way a Look's
      // are — so the row shows one badge where a Look may show several.
      families: template?.family != null ? [template.family] : [],
      // Only claimable when this caller actually has the template library: a cue's read surface may
      // not, and painting a layer as missing because the *caller* did not load a list would be a
      // lie about the data.
      missing: librariesLoaded && templatesById != null && template == null,
      isTemplate: true,
    }
  }
  const look = looksById.get(source.id)
  return {
    name: source.name ?? look?.name,
    families: look?.families ?? [],
    missing: librariesLoaded && look == null,
    isTemplate: false,
  }
}

/**
 * One line of a layer composition.
 *
 * Exported because the cue editor's by-target arrangement renders these outside a stack, with
 * `sortable={false}`: the order is a property of the cue, not of one target, and a list filtered to
 * a single target cannot express it.
 */
export function LayerRow({
  layer,
  index,
  info,
  handlers,
  sortable,
  sortableId,
  showTargets,
  readOnly,
  focused,
}: {
  layer: LookStackLayer
  index: number
  info: StackSourceInfo
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
  /** The value grid is pointed at this layer. */
  focused?: boolean
}) {
  const enabled = layer.enabled !== false
  // Resolved by `describeStackSource`: the layer's own `source.name` arrives with the read, so a row
  // is labelled before either library lands; the library lookup only adds the families and the
  // deleted-since-read case.
  const { name, missing, isTemplate } = info

  return (
    <SortableShell sortable={sortable} sortableId={sortableId}>
      {(dragHandle) => (
        <div
          className={cn(
            'flex flex-wrap items-center gap-2 rounded border bg-card p-2 text-xs',
            !enabled && 'opacity-60',
            // A ring rather than a filled "selected" row: the operator is still looking at the
            // stack, and a highlight loud enough to read as a selection would compete with the
            // ownership colours in the grid this focus is driving.
            focused && 'ring-1 ring-primary',
          )}
        >
          {dragHandle}
          <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px] font-mono">
            {index + 1}
          </Badge>
          {/* The name badge *is* the focus control where there is a grid to focus. A separate
              button would be a second thing to learn for what reads as "look at this one", and
              the badge is already the row's subject. Absent the handler it stays a plain badge —
              a cue's rows and the Look editor's preview have nothing to point anywhere.

              `readOnly` gates it for the same reason it gates the amount field and the remove
              button. `ProgrammerLookStack` renders the preview row *outside* its filtered list, at
              `index === layers.length`, and passes the same `handlers` — so without this the preview
              got a badge that looked pressable and resolved to `layers[layers.length]`, i.e. did
              nothing at all. */}
          {handlers?.onFocus && !readOnly ? (
            <button
              type="button"
              onClick={() => handlers.onFocus?.(index)}
              className="min-w-0 rounded focus-visible:ring-1 focus-visible:ring-ring"
              aria-pressed={focused === true}
              title={focused ? 'The grid is showing this look' : 'Show this look in the grid'}
            >
              <LookNameBadge name={name} missing={missing} isTemplate={isTemplate} />
            </button>
          ) : (
            <LookNameBadge name={name} missing={missing} isTemplate={isTemplate} />
          )}

          {info.families.map((family) => (
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

          {/* A badge when the row can't be edited, a toggle when it can — and the toggle has to
              render in both states, unlike the mask and blend badges beside it, or there would be
              no way to switch stomp *on*. */}
          {readOnly
            ? layer.stomp && (
                <Badge
                  variant="outline"
                  className="shrink-0 px-1.5 py-0 text-[10px]"
                  title="Switches off the effects of every layer below this one"
                >
                  STOMP
                </Badge>
              )
            : (
                <Button
                  type="button"
                  variant={layer.stomp ? 'secondary' : 'ghost'}
                  size="icon"
                  className={cn(
                    'size-6 shrink-0',
                    layer.stomp ? 'text-foreground' : 'text-muted-foreground',
                  )}
                  aria-label={layer.stomp ? 'Stop stomping lower layers' : 'Stomp lower layers'}
                  aria-pressed={layer.stomp === true}
                  // Nothing sits below the bottom layer, so its stomp suppresses nothing — the
                  // server's suppression is built from the layers *strictly* below the stomper, and
                  // at rank 0 that set is empty. Said in the tooltip rather than by disabling the
                  // control: a layer that was stomping and is then dragged to the bottom must still
                  // be clearable, and the flag becomes live again the moment it is reordered.
                  title={
                    index === 0
                      ? 'Stomp lower layers — no layer is below this one, so it suppresses nothing until this layer is moved up the stack'
                      : layer.stomp
                        ? 'Stomping: the effects of every layer below this one are switched off on the properties it sets'
                        : 'Stomp lower layers — switches off their effects on the properties this layer sets. Use it when an effect below is fighting a value here.'
                  }
                  onClick={() => handlers?.onSetStomp(index, !layer.stomp)}
                >
                  {/* Not `Zap`, which already means *script hooks* in `CuePropsPane`,
                      `CueCardEditor` and `CueDetailContent` — the same cue editor that now draws one
                      of these per layer row, so it would be one glyph for two unrelated things on
                      one screen. `Footprints` is the metaphor the feature is named after and is
                      unused elsewhere. */}
                  <Footprints className="size-3.5" />
                </Button>
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

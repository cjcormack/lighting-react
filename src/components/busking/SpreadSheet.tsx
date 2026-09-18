import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeftRight, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { CueTarget } from '@/api/cuesApi'
import type { TemplateSummary } from '@/api/templatesApi'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ColourPickerBody } from '@/components/fixtures/ColourPickerBody'
import { targetFamilies } from '@/components/fixtures-list/rowModel'
import { hexToRgb } from '@/components/fx/colourUtils'
import { isOfferableColourTemplate } from '@/components/fx/FxColourTemplates'
import { RecordLookSheet } from '@/components/programmer/RecordLookSheet'
import { useCellEditorCramped } from '@/components/sheet/cells/CellEditorSurface'
import { useLivePush } from '@/hooks/useLivePush'
import { useFixtureLookup } from '@/hooks/useFixtureLookup'
import { ATTRIBUTE_FAMILIES, FAMILY_LABELS, formatFamilyList, type AttributeFamily } from '@/lib/attributeFamily'
import { computeCombinedCss } from '@/lib/colourMath'
import { getProgrammerFadeMs } from '@/lib/programmerFade'
import { skippedRowsMessage } from '@/lib/selectionMask'
import {
  SPREAD_CURVES,
  SPREAD_ORDERS,
  SPREAD_PARTS_PRESETS,
  colourEndpointOf,
  defaultSpreadEndpoints,
  isCompleteSpreadEndpoint,
  serializeSpreadEndpoint,
  spreadEditorKind,
  spreadPropertiesFor,
  type SpreadEndpoint,
} from '@/lib/spreadIntent'
import {
  WHITE_POLICIES,
  WHITE_POLICY_LABELS,
  parseTemplateIntent,
  templatePropertyFor,
  type TemplateProperty,
  type WhitePolicy,
} from '@/lib/templateIntent'
import { cn } from '@/lib/utils'
import type { Fixture } from '@/store/fixtures'
import {
  useSpreadMutation,
  type SpreadCurve,
  type SpreadOrder,
  type SpreadOver,
  type SpreadRequest,
  type SpreadResponse,
} from '@/store/programmerOps'
import { ignoreReportedError } from '@/store/errorToastMiddleware'
import { useTemplateListQuery } from '@/store/templates'
import { templateSwatch } from './padFace'
import { BuskLabel } from './BuskLabel'
import { writeTargetsOf } from './ColourSheet'
import { lookLayerTarget, selectedHeadCount, type BuskingTarget } from './buskingTypes'

/**
 * The side sheet's **Spread** tab — fan, resolved on the desk (busk-further plan D9, D10;
 * `Spread.dc.html` is the authority on layout).
 *
 * **The client never interpolates.** The tab sends two intents of one property's shape, a curve,
 * an order, parts and an over-switch to `POST /programmer/spread`; the desk interpolates in the
 * intent's own space, resolves one literal per head through the same `TemplateResolver` a template
 * click uses, writes each into Local, and answers what it wrote. Only the desk knows a group's
 * member order, each head's range, which cells a fixture has and what a colour means on a head with
 * amber — the rule that keeps `templateIntent.ts` a serialiser, and the reason this file imports
 * nothing from `sheet/fanMath.ts`, the client fan that lerps bytes over rows it can see. The
 * **preview strip is drawn from the answer**: one bar per head, the written heads in the order the
 * desk wrote them (rig order) and then any it skipped, dimmed with the reason on its title, a
 * multi-head fixture's cells folded into its bar. A skipped head is drawn after the written ones
 * rather than in its rig position because the answer carries no position — `written` and
 * `skipped` are two lists — and recovering one here would be a second copy of an order the desk
 * owns. It is empty until the desk has answered, and it never shows what this side thinks the
 * desk *would* do.
 *
 * **A spread is a result, not a template** (D10). *Save as Look…* opens `RecordLookSheet` over
 * the selection — `record-look`, the same gesture every busked state is kept by — and nothing here
 * mints a template: a "spread template" would need a second grammar and a resolver that knows the
 * selection's order at cook time, which no template does.
 *
 * **Live** applies every adjustment as it is made, through {@link useLivePush} with an equality over
 * the whole request — the tempo fader's discipline, because a fan is judged by eye against the rig.
 * The release is read from the **window**, as the Colour tab reads it: the picker binds its own
 * release to the document. Off, only *Apply* writes. Under an empty selection nothing is sent and
 * the strip's own sentence is toasted; the desk would answer `SPREAD_NEEDS_SELECTION` otherwise,
 * which `errorToastMiddleware` renders, and the tab must not say it twice.
 *
 * **The mask is honoured by the desk, not pre-refused here.** A property outside the selection's
 * families writes nothing and answers `skippedFamilies` — a 200, the Look press's shape — which is
 * toasted in `skippedRowsMessage`'s vocabulary. The header reads the family pill so the operator
 * sees the mask before pressing.
 *
 * **The colour picker is seeded, never fed its own writes.** `ColourPickerBody`'s `combinedCss`
 * moves only when the tab means the knob to move — switching the endpoint being edited, Swap, the
 * Colour tab's *Second colour* hand-over — for the ping-pong reason documented on that prop.
 *
 * **Order is a `DistributionStrategy` name.** Rig · Reverse · Centre · Random are `LINEAR` ·
 * `REVERSE` · `CENTER_OUT` · `RANDOM`; the design's *Stage L→R* is a footnote under the row rather
 * than an option, because the desk has no stage order today (`SPREAD_ORDERS` says why).
 */

export interface SpreadSeed {
  /**
   * The Colour tab's current colour, handed over as *From* — its **RGB** only. A colour intent has
   * no emitter component (white, amber and UV are rows of their own in the template grammar), so
   * a white or amber the Colour tab was driving is dropped here and *From* is the RGB part with
   * policy `extract`, which re-derives a white per head.
   */
  from: { r: number; g: number; b: number }
  /** A fresh identity per hand-over, so two hand-overs of one colour both land. */
  key: number
}

export interface SpreadSheetProps {
  projectId: number
  selectedTargets: Map<string, BuskingTarget>
  /** The selection's attribute mask, sent with the request and drawn as the header's pill. Null is every attribute. */
  families: AttributeFamily[] | null
  /** A *From* handed over by the Colour tab's *Second colour* switch; applied once, on change. */
  seed?: SpreadSeed | null
  /** Called once a seed has been applied, so the host can drop it. */
  onSeedConsumed?: () => void
  /** Force the tighter layout; the cramped height query answers it otherwise. */
  compact?: boolean
}

const EMPTY_SELECTION_TOAST = 'spread-sheet-empty-selection'
/** Keyed like the endpoint's error toast: a Live drag under a mask answers `skippedFamilies` on every write. */
const SKIPPED_FAMILIES_TOAST = 'spread-sheet-skipped-families'

export interface SpreadForm {
  family: AttributeFamily
  property: TemplateProperty
  from: SpreadEndpoint
  to: SpreadEndpoint
  curve: SpreadCurve
  order: SpreadOrder
  parts: number
  over: SpreadOver
  seed: number
}

/**
 * Where a fresh tab lands: the first family the selection's mask names that the selection can take
 * — a Colour marquee opens the tab on Colour — else the first the selection can take.
 */
function initialFamily(available: readonly AttributeFamily[], mask: readonly AttributeFamily[] | null): AttributeFamily {
  return mask?.find((family) => available.includes(family)) ?? available[0] ?? 'INTENSITY'
}

function initialForm(family: AttributeFamily): SpreadForm {
  const property = spreadPropertiesFor(family)[0]
  return {
    family,
    property,
    ...defaultSpreadEndpoints(property),
    curve: 'LINE',
    order: 'LINEAR',
    parts: 1,
    over: 'HEADS',
    seed: 0,
  }
}

/** The request two forms would send, compared as strings: the live push's dedupe. */
const sameRequest = (a: SpreadRequest, b: SpreadRequest) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The request a form sends over a selection, or null when an endpoint is not yet something the
 * desk can take (a half-typed number). The fade is not part of it: it is read at send time.
 */
export function spreadRequestOf(
  projectId: number,
  targets: CueTarget[],
  families: AttributeFamily[] | null,
  form: SpreadForm,
): SpreadRequest | null {
  if (!isCompleteSpreadEndpoint(form.from) || !isCompleteSpreadEndpoint(form.to)) return null
  return {
    projectId,
    targets,
    families: families ?? undefined,
    property: form.property.propertyName,
    from: serializeSpreadEndpoint(form.from),
    to: serializeSpreadEndpoint(form.to),
    curve: form.curve,
    order: form.order,
    parts: form.parts,
    over: form.over,
    seed: form.seed,
  }
}

/**
 * How many cells the selection reaches: every element of every selected or member fixture, plus
 * each cell selected on its own whose parent is not — a cell is one head already, and Over: Cells
 * has nothing further to split it into. Whole fixtures first, so the order of the selection
 * cannot count a cell twice.
 */
export function selectedCellCount(selected: readonly BuskingTarget[], fixtures: readonly Fixture[] | undefined): number {
  const whole = new Map<string, Fixture>()
  for (const target of selected) {
    if (target.type === 'group') {
      for (const fixture of fixtures ?? []) if (fixture.groups.includes(target.name)) whole.set(fixture.key, fixture)
    } else if (target.element == null) {
      whole.set(target.fixture.key, target.fixture)
    }
  }
  let cells = 0
  for (const fixture of whole.values()) cells += fixture.elements?.length ?? 0
  const loose = new Set<string>()
  for (const target of selected) {
    if (target.type === 'fixture' && target.element != null && !whole.has(target.fixture.key)) loose.add(target.element.key)
  }
  return cells + loose.size
}

/** One bar of the preview strip: a head, its cells folded in. */
export interface PreviewBar {
  key: string
  name: string
  /** One per write on this head — one for a whole fixture, one per cell over CELLS. */
  values: string[]
  /** The desk's reason, for a head it could not resolve. */
  skipped?: string
}

/**
 * The strip, folded from the desk's answer: one bar per written head in the order the desk wrote
 * them, then one per skipped head, a cell's write folded into its parent's bar. Never computed from
 * the request — only from `written` and `skipped`.
 */
export function previewBarsOf(response: SpreadResponse | null, fixtures: readonly Fixture[] | undefined): PreviewBar[] {
  if (response == null) return []
  const bars = new Map<string, PreviewBar>()
  const headOf = (key: string): { key: string; name: string } => {
    const own = fixtures?.find((fixture) => fixture.key === key)
    if (own != null) return { key: own.key, name: own.name }
    const parent = fixtures?.find((fixture) => fixture.elements?.some((element) => element.key === key))
    return parent != null ? { key: parent.key, name: parent.name } : { key, name: key }
  }
  for (const write of response.written ?? []) {
    const head = headOf(write.target.key)
    const bar = bars.get(head.key) ?? { ...head, values: [] }
    bar.values.push(write.value)
    bars.set(head.key, bar)
  }
  for (const skip of response.skipped ?? []) {
    const head = headOf(skip.target.key)
    if (bars.has(head.key)) continue
    bars.set(head.key, { ...head, values: [], skipped: skip.reason })
  }
  return [...bars.values()]
}

/**
 * A template a colour endpoint may name: the FX colour parameter's own offer rule (generic, value,
 * COLOUR — one statement, in `FxColourTemplates.tsx`), **and** a `rgbColour` row. The desk's
 * `spreadEndpoint` resolves a `tmpl:` through the template's colour row alone and answers 400
 * `SPREAD_INVALID` for a template made only of emitter rows (a UV-only template is a legal
 * template but has no hex to interpolate), so one is not offered rather than refused after the press.
 */
export function isSpreadColourTemplate(template: TemplateSummary): boolean {
  return (
    isOfferableColourTemplate(template) &&
    (template.rows ?? []).some((row) => templatePropertyFor(row.propertyName)?.intent === 'colour')
  )
}

export function SpreadSheet({ projectId, selectedTargets, families, seed, onSeedConsumed, compact }: SpreadSheetProps) {
  const cramped = useCellEditorCramped()
  const isCompact = compact ?? cramped
  const selected = useMemo(() => [...selectedTargets.values()], [selectedTargets])
  const { fixtures } = useFixtureLookup()
  const { data: templates } = useTemplateListQuery({ projectId })
  const [spread] = useSpreadMutation()

  const headCount = selectedHeadCount(selected)
  const names = useMemo(
    () =>
      selected.map((target) =>
        target.type === 'group'
          ? target.name
          : target.element != null
            ? `${target.fixture.name} · ${target.element.displayName}`
            : target.fixture.name,
      ),
    [selected],
  )
  const writeTargets = useMemo(() => writeTargetsOf(selected, fixtures), [selected, fixtures])
  const available = useMemo(() => targetFamilies(writeTargets), [writeTargets])
  const cellCount = useMemo(() => selectedCellCount(selected, fixtures), [selected, fixtures])
  const layerTargets = useMemo(() => selected.map(lookLayerTarget), [selected])
  const colourTemplates = useMemo(() => (templates ?? []).filter(isSpreadColourTemplate), [templates])

  const [form, setForm] = useState<SpreadForm>(() => initialForm(initialFamily(available, families)))
  // Written by the handlers that move `form`, never at render time — the Colour tab's
  // `channelsRef` rule: a fast drag can dispatch its last move and its release inside one task.
  const formRef = useRef(form)
  const [live, setLive] = useState(false)
  // Read by the window release handler, which must not flush once Live is off: the switch can be
  // toggled from the keyboard, which dispatches a click and no `pointerup` to clear the gesture.
  const liveRef = useRef(live)
  liveRef.current = live
  const [editing, setEditing] = useState<'from' | 'to'>('from')
  const [response, setResponse] = useState<SpreadResponse | null>(null)
  /**
   * The strip draws the answer to the **latest** request and nothing older. Live keeps several
   * requests in flight at the floor's spacing and their answers can land out of order; a property
   * or selection change clears the strip and must not have an in-flight answer repaint it under
   * the new kind. Each send takes a number, and an answer is applied only if it is still the last.
   */
  const requestSeq = useRef(0)
  const [saving, setSaving] = useState(false)
  const gestureRef = useRef(false)
  /** The picker's knob is seeded from this and only this — see the class doc. */
  const [pickerSeed, setPickerSeed] = useState<{ css: string; key: number }>(() => ({ css: '#000000', key: 0 }))

  const reseedPicker = useCallback((endpoint: SpreadEndpoint) => {
    if (endpoint.kind !== 'colour') return
    const rgb = hexToRgb(endpoint.hex)
    setPickerSeed((prev) => ({ css: computeCombinedCss(rgb.r, rgb.g, rgb.b, 0, 0, 0), key: prev.key + 1 }))
  }, [])

  const { push, flush, reset } = useLivePush<SpreadRequest>(
    (request) => {
      const seq = ++requestSeq.current
      void spread({ ...request, fadeMs: getProgrammerFadeMs() })
        .unwrap()
        .then((answer) => {
          if (seq !== requestSeq.current) return
          setResponse(answer)
          const message = skippedRowsMessage(answer.skippedFamilies ?? [], families)
          if (message != null) toast.warning(message, { id: SKIPPED_FAMILIES_TOAST })
        })
        .catch(() => {
          // The refusal is toasted by `errorToastMiddleware`. A refused request wrote nothing, so
          // the strip — which says it is the desk's answer to *this* spread — must not keep drawing
          // the last one that landed; the same rule a property change applies.
          if (seq === requestSeq.current) setResponse(null)
          ignoreReportedError()
        })
    },
    { equals: sameRequest },
  )

  /** Drop the strip and disown any answer still in flight. */
  const clearAnswer = useCallback(() => {
    requestSeq.current += 1
    setResponse(null)
  }, [])

  /** A request for the form as it stands, or null — with the empty-selection refusal said once. */
  const requestFor = useCallback(
    (next: SpreadForm, say: boolean): SpreadRequest | null => {
      if (layerTargets.length === 0) {
        if (say) toast.error('Select the fixtures this should land on first', { id: EMPTY_SELECTION_TOAST })
        return null
      }
      return spreadRequestOf(projectId, layerTargets, families, next)
    },
    [layerTargets, families, projectId],
  )

  /** Move the form; while Live, every move is a write. */
  const commit = useCallback(
    (patch: Partial<SpreadForm>) => {
      const next = { ...formRef.current, ...patch }
      formRef.current = next
      setForm(next)
      if (!live) return
      const request = requestFor(next, true)
      if (request == null) return
      gestureRef.current = true
      push(request)
    },
    [live, requestFor, push],
  )

  const apply = useCallback(() => {
    const request = requestFor(formRef.current, true)
    if (request == null) return
    // An explicit press always sends, even the request Live sent a moment ago.
    reset()
    flush(request)
  }, [requestFor, reset, flush])

  // The release: whatever the finger let go on lands, past the floor — read from the window, as
  // the Colour tab and the tempo fader read theirs, because the picker binds its own release to
  // the document and a drag let go outside the sheet never reaches a handler on it.
  useEffect(() => {
    const onRelease = () => {
      if (!gestureRef.current) return
      gestureRef.current = false
      if (!liveRef.current) return
      const request = requestFor(formRef.current, false)
      if (request != null) flush(request)
    }
    window.addEventListener('pointerup', onRelease)
    window.addEventListener('pointercancel', onRelease)
    return () => {
      window.removeEventListener('pointerup', onRelease)
      window.removeEventListener('pointercancel', onRelease)
    }
  }, [requestFor, flush])

  // A fresh selection is a fresh gesture: nothing the last one sent says where these heads are,
  // and the strip described the heads that are no longer under the header.
  const selectionKey = useMemo(() => [...selectedTargets.keys()].join('|'), [selectedTargets])
  useEffect(() => {
    gestureRef.current = false
    reset()
    clearAnswer()
  }, [selectionKey, reset, clearAnswer])

  /** Change the property (and family): fresh endpoints, and the last answer no longer describes this property. */
  const chooseProperty = useCallback(
    (property: TemplateProperty) => {
      const next: SpreadForm = { ...formRef.current, family: property.family, property, ...defaultSpreadEndpoints(property), over: formRef.current.over }
      formRef.current = next
      setForm(next)
      clearAnswer()
      setEditing('from')
      reseedPicker(next.from)
      reset()
    },
    [reseedPicker, reset, clearAnswer],
  )

  /**
   * Whether the tab's family is settled — by the operator choosing one, or by the tab having once
   * resolved its default against a real selection. Until then the family is the tab's own default,
   * the first the mask names that the selection can take, re-derived as the selection and the mask
   * arrive: on a cold mount the fixture list may not have answered yet, so the initialiser fell
   * back to Intensity. Settled, the family stands as long as the selection can still take it — a
   * head added mid-edit must not reset the endpoints the operator has typed — and a family that
   * left the selection takes its property with it. An empty selection keeps whatever is showing.
   */
  const chosenRef = useRef(false)
  useEffect(() => {
    if (available.length === 0) return
    const current = formRef.current.family
    const wanted = chosenRef.current && available.includes(current) ? current : initialFamily(available, families)
    chosenRef.current = true
    if (wanted !== current) chooseProperty(spreadPropertiesFor(wanted)[0])
  }, [available, families, form.family, chooseProperty])

  // Over: Cells with nothing to split falls back to Heads, and says nothing — the control is
  // disabled with the count on it.
  useEffect(() => {
    if (cellCount === 0 && formRef.current.over === 'CELLS') commit({ over: 'HEADS' })
  }, [cellCount, commit])

  // The Colour tab's hand-over: Colour, From set to its colour, the knob seeded to it, applied
  // once per seed and then dropped by the host.
  useEffect(() => {
    if (seed == null) return
    // A selection that cannot take colour has nothing for the hand-over to set; the seed is spent
    // rather than left to re-apply, and the family segment keeps a checked item.
    if (available.length > 0 && !available.includes('COLOUR')) {
      onSeedConsumed?.()
      return
    }
    chosenRef.current = true
    const property = spreadPropertiesFor('COLOUR')[0]
    const from = colourEndpointOf(seed.from)
    const current = formRef.current
    const next: SpreadForm = {
      ...current,
      family: 'COLOUR',
      property,
      from,
      to: current.property.propertyName === property.propertyName && current.to.kind !== 'level' ? current.to : defaultSpreadEndpoints(property).to,
    }
    formRef.current = next
    setForm(next)
    clearAnswer()
    setEditing('from')
    reseedPicker(from)
    reset()
    onSeedConsumed?.()
  }, [seed, onSeedConsumed, reseedPicker, reset, clearAnswer, available])

  // First paint of a colour editor: seed the knob from *From* (the initial state is a placeholder).
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current) return
    seededRef.current = true
    reseedPicker(formRef.current.from)
  }, [reseedPicker])

  const swap = () => {
    const { from, to } = formRef.current
    commit({ from: to, to: from })
    reseedPicker(editing === 'from' ? to : from)
  }

  const editorKind = spreadEditorKind(form.property)
  const properties = spreadPropertiesFor(form.family)
  const familiesShown = available.length > 0 ? available : ATTRIBUTE_FAMILIES
  const bars = useMemo(() => previewBarsOf(response, fixtures), [response, fixtures])
  const editingEndpoint = editing === 'from' ? form.from : form.to
  const setEndpoint = (which: 'from' | 'to', endpoint: SpreadEndpoint) => commit({ [which]: endpoint })

  return (
    <div data-spread-sheet={isCompact ? 'compact' : 'full'} className="flex min-h-0 flex-1 flex-col overflow-y-auto border-l">
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-2.5 pb-2">
        <span data-spread-heading className="text-[11px] font-semibold">
          Spread over {headCount} {headCount === 1 ? 'head' : 'heads'}
          {names.length > 0 && <span className="font-normal text-muted-foreground"> · {names.join(', ')}</span>}
          <span className="font-normal text-muted-foreground"> · writes to Local</span>
        </span>
        {families != null && families.length > 0 && (
          <Badge
            variant="outline"
            className="shrink-0 whitespace-nowrap border-primary/40 bg-primary/10 px-2 py-0 text-[10px] text-primary"
            title="The selection’s attribute mask — the desk skips a property outside it and the strip says so"
          >
            {formatFamilyList(families, ' · ')}
          </Badge>
        )}
      </div>

      <div className={cn('flex flex-col gap-2 px-3', isCompact ? 'pb-2' : 'pb-3')}>
        <ToggleGroup
          type="single"
          size="sm"
          aria-label="Family"
          value={form.family}
          onValueChange={(next) => {
            if (!next) return
            chosenRef.current = true
            chooseProperty(spreadPropertiesFor(next as AttributeFamily)[0])
          }}
          className="w-full justify-start"
        >
          {familiesShown.map((family) => (
            <ToggleGroupItem key={family} value={family} className="flex-1 text-xs" data-spread-family={family}>
              {FAMILY_LABELS[family].singular}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {properties.length > 1 && (
          <ToggleGroup
            type="single"
            size="sm"
            aria-label="Property"
            value={form.property.propertyName}
            onValueChange={(next) => {
              const property = properties.find((p) => p.propertyName === next)
              if (property == null) return
              chosenRef.current = true
              chooseProperty(property)
            }}
            className="w-full justify-start"
          >
            {properties.map((property) => (
              <ToggleGroupItem key={property.propertyName} value={property.propertyName} className="flex-1 text-xs">
                {property.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}

        {/* From / To. A colour has one picker for whichever end is being edited; the other three
            shapes are typed side by side. */}
        {editorKind === 'colour' ? (
          <ColourEndpoints
            from={form.from}
            to={form.to}
            editing={editing}
            onEdit={(which) => {
              setEditing(which)
              reseedPicker(which === 'from' ? formRef.current.from : formRef.current.to)
            }}
            onSwap={swap}
            templates={colourTemplates}
            onTemplate={(uuid) => {
              // Back to a colour is back to the default for that end; the knob follows it.
              const endpoint: SpreadEndpoint = uuid == null ? defaultSpreadEndpoints(form.property)[editing] : { kind: 'template', uuid }
              setEndpoint(editing, endpoint)
              reseedPicker(endpoint)
            }}
            policy={form.from.kind === 'colour' ? form.from.policy : 'extract'}
            policyFromTemplate={form.from.kind === 'template'}
            onPolicy={(policy) =>
              commit({
                from: form.from.kind === 'colour' ? { ...form.from, policy } : form.from,
                to: form.to.kind === 'colour' ? { ...form.to, policy } : form.to,
              })
            }
          >
            <ColourPickerBody
              r={editingEndpoint.kind === 'colour' ? hexToRgb(editingEndpoint.hex).r : 0}
              g={editingEndpoint.kind === 'colour' ? hexToRgb(editingEndpoint.hex).g : 0}
              b={editingEndpoint.kind === 'colour' ? hexToRgb(editingEndpoint.hex).b : 0}
              combinedCss={pickerSeed.css}
              seedKey={pickerSeed.key}
              hasWhiteChannel={false}
              hasAmberChannel={false}
              hasUvChannel={false}
              onColourChange={(r, g, b) => {
                const policy = editingEndpoint.kind === 'colour' ? editingEndpoint.policy : 'extract'
                setEndpoint(editing, colourEndpointOf({ r, g, b }, policy))
              }}
              channelFields
              compact
              open
            />
          </ColourEndpoints>
        ) : (
          <NumericEndpoints kind={editorKind} from={form.from} to={form.to} onChange={setEndpoint} onSwap={swap} />
        )}

        <div>
          <BuskLabel>Curve</BuskLabel>
          <ToggleGroup
            type="single"
            aria-label="Curve"
            value={form.curve}
            onValueChange={(next) => next && commit({ curve: next as SpreadCurve })}
            className="mt-1 h-auto w-full justify-start"
          >
            {SPREAD_CURVES.map((curve) => (
              <ToggleGroupItem key={curve.id} value={curve.id} title={curve.hint} className="h-auto flex-1 flex-col gap-0.5 px-1 py-1 text-[10px]">
                <CurvePicture curve={curve.id} />
                {curve.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div>
          <BuskLabel>Order</BuskLabel>
          <ToggleGroup
            type="single"
            size="sm"
            aria-label="Order"
            value={form.order}
            onValueChange={(next) => {
              if (!next) {
                // Radix reports a re-press as an empty value; on Random that is a reshuffle.
                if (formRef.current.order === 'RANDOM') commit({ seed: formRef.current.seed + 1 })
                return
              }
              commit({ order: next as SpreadOrder })
            }}
            className="mt-1 w-full justify-start"
          >
            {SPREAD_ORDERS.filter((order) => order.id != null).map((order) => (
              <ToggleGroupItem key={order.label} value={order.id!} title={order.hint} className="flex-1 text-xs">
                {order.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {/* The design's fifth order, said rather than offered: a disabled item in the row wrapped
              onto a second line at 288px and read as a control that was merely off. */}
          {SPREAD_ORDERS.filter((order) => order.id == null).map((order) => (
            <p key={order.label} data-spread-order-unavailable={order.label} className="mt-1 text-[10px] text-muted-foreground" title={order.hint}>
              {order.label}: not on the desk yet
            </p>
          ))}
        </div>

        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <BuskLabel>Parts</BuskLabel>
            <div className="mt-1 flex items-center gap-1">
              <ToggleGroup
                type="single"
                size="sm"
                aria-label="Parts"
                value={SPREAD_PARTS_PRESETS.includes(form.parts) ? String(form.parts) : ''}
                onValueChange={(next) => next && commit({ parts: Number(next) })}
              >
                {SPREAD_PARTS_PRESETS.map((n) => (
                  <ToggleGroupItem key={n} value={String(n)} className="text-xs">
                    {n}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <NumberField label="Parts, N" value={form.parts} min={1} onCommit={(n) => commit({ parts: Math.round(n) })} className="h-7 w-14 px-1.5 text-xs" />
            </div>
          </div>
          <div>
            <BuskLabel>Over</BuskLabel>
            <ToggleGroup
              type="single"
              size="sm"
              aria-label="Over"
              value={form.over}
              onValueChange={(next) => next && commit({ over: next as SpreadOver })}
              className="mt-1"
            >
              <ToggleGroupItem value="HEADS" className="text-xs" title="Each fixture is one step">
                Heads
              </ToggleGroupItem>
              <ToggleGroupItem
                value="CELLS"
                className="text-xs"
                disabled={cellCount === 0}
                title={cellCount === 0 ? 'No selected fixture has cells' : `Each cell is one step — ${cellCount} cells`}
              >
                Cells{cellCount > 0 && <span className="ml-1 text-muted-foreground tabular-nums">{cellCount}</span>}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <Button
          type="button"
          role="switch"
          aria-checked={live}
          variant={live ? 'default' : 'outline'}
          size="sm"
          className="h-7 justify-start text-xs"
          title="Send every adjustment to the desk as it is made; off, only Apply writes"
          onClick={() => {
            setLive((on) => !on)
            gestureRef.current = false
            reset()
          }}
        >
          Live — apply as I adjust
        </Button>
      </div>

      <div className="border-t px-3 pt-2 pb-2">
        <BuskLabel>Preview</BuskLabel>
        <PreviewStrip bars={bars} kind={editorKind} compact={isCompact} />
        <p className="mt-1 text-[10px] text-muted-foreground">
          {bars.length === 0
            ? 'One bar per head as the desk wrote them, cells folded, skipped heads last — drawn from the desk’s answer once it has written'
            : 'One bar per head as the desk wrote them, cells folded, skipped heads last. Redrawn from the desk’s answer, not computed here.'}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t px-3 py-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={selected.length === 0}
          title="Record the selection’s Local values as a Look — a spread is a result, not a template"
          onClick={() => setSaving(true)}
        >
          <Save className="size-3.5" /> Save as Look…
        </Button>
        <span className="flex-1" />
        <Button type="button" size="sm" className="h-7 text-xs" onClick={apply} title="Send the spread to the desk">
          Apply
        </Button>
      </div>

      <RecordLookSheet open={saving} onOpenChange={setSaving} projectId={projectId} targets={layerTargets} />
    </div>
  )
}

// ─── The endpoint editors ───────────────────────────────────────────────────

function endpointSwatch(endpoint: SpreadEndpoint, templates: readonly TemplateSummary[]): string | null {
  if (endpoint.kind === 'colour') return endpoint.hex
  if (endpoint.kind === 'template') {
    const template = templates.find((t) => t.uuid === endpoint.uuid)
    return template == null ? null : templateSwatch(template)
  }
  return null
}

function endpointLabel(endpoint: SpreadEndpoint, templates: readonly TemplateSummary[]): string {
  switch (endpoint.kind) {
    case 'colour':
      return endpoint.hex.toUpperCase()
    case 'template':
      return templates.find((t) => t.uuid === endpoint.uuid)?.name ?? 'template'
    case 'percent':
      return `${endpoint.value}%`
    case 'level':
      return String(endpoint.value)
    case 'position':
      return `${endpoint.panDeg}° / ${endpoint.tiltDeg}°`
  }
}

function ColourEndpoints({
  from,
  to,
  editing,
  onEdit,
  onSwap,
  templates,
  onTemplate,
  policy,
  policyFromTemplate,
  onPolicy,
  children,
}: {
  from: SpreadEndpoint
  to: SpreadEndpoint
  editing: 'from' | 'to'
  onEdit: (which: 'from' | 'to') => void
  onSwap: () => void
  templates: readonly TemplateSummary[]
  onTemplate: (uuid: string | null) => void
  policy: WhitePolicy
  /** From is a `tmpl:` reference: the desk reads the policy off the template's own row, so the control is inert and says so. */
  policyFromTemplate: boolean
  onPolicy: (policy: WhitePolicy) => void
  children: ReactNode
}) {
  const current = editing === 'from' ? from : to
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <EndpointButton which="from" endpoint={from} active={editing === 'from'} templates={templates} onClick={() => onEdit('from')} />
        <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5" onClick={onSwap} aria-label="Swap From and To" title="Swap From and To">
          <ArrowLeftRight className="size-3.5" />
        </Button>
        <EndpointButton which="to" endpoint={to} active={editing === 'to'} templates={templates} onClick={() => onEdit('to')} />
      </div>
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="shrink-0">or a template</span>
          <select
            aria-label={`${editing === 'from' ? 'From' : 'To'} template`}
            className="h-6 min-w-0 flex-1 rounded-md border bg-background px-1 text-xs text-foreground"
            value={current.kind === 'template' ? current.uuid : ''}
            onChange={(e) => onTemplate(e.target.value === '' ? null : e.target.value)}
          >
            <option value="">— a colour —</option>
            {templates.map((template) => (
              <option key={template.uuid} value={template.uuid}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        {/* The desk interpolates with *From*'s policy alone (`interpolateIntent` keeps `from.policy`),
            so the control edits From's — and while From is a template the policy is the template
            row's, which nothing here can move. */}
        <ToggleGroup
          type="single"
          size="sm"
          aria-label="White policy"
          value={policyFromTemplate ? '' : policy}
          disabled={policyFromTemplate}
          title={policyFromTemplate ? 'From is a template: the desk takes the white policy from the template’s own colour row' : 'How From’s colour uses a head’s white and amber emitters — the desk interpolates with this policy'}
          onValueChange={(next) => next && onPolicy(next as WhitePolicy)}
        >
          {WHITE_POLICIES.map((p) => (
            <ToggleGroupItem key={p} value={p} className="text-[10px]" title={WHITE_POLICY_LABELS[p].hint}>
              {WHITE_POLICY_LABELS[p].label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  )
}

function EndpointButton({
  which,
  endpoint,
  active,
  templates,
  onClick,
}: {
  which: 'from' | 'to'
  endpoint: SpreadEndpoint
  active: boolean
  templates: readonly TemplateSummary[]
  onClick: () => void
}) {
  const swatch = endpointSwatch(endpoint, templates)
  return (
    <button
      type="button"
      data-spread-endpoint={which}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 text-left text-xs',
        active ? 'border-primary bg-primary/10' : 'bg-card hover:bg-accent',
      )}
      title={`Edit ${which === 'from' ? 'From' : 'To'}`}
    >
      <span className="text-[10px] font-semibold uppercase text-muted-foreground">{which === 'from' ? 'From' : 'To'}</span>
      {swatch != null && <span aria-hidden className="size-3.5 shrink-0 rounded-full border border-border" style={{ background: swatch }} />}
      <span className="min-w-0 flex-1 truncate font-mono tabular-nums">{endpointLabel(endpoint, templates)}</span>
    </button>
  )
}

function NumericEndpoints({
  kind,
  from,
  to,
  onChange,
  onSwap,
}: {
  kind: 'percent' | 'position' | 'level'
  from: SpreadEndpoint
  to: SpreadEndpoint
  onChange: (which: 'from' | 'to', endpoint: SpreadEndpoint) => void
  onSwap: () => void
}) {
  return (
    <div className="flex items-end gap-1.5">
      <NumericEndpoint which="from" kind={kind} endpoint={from} onChange={(next) => onChange('from', next)} />
      <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5" onClick={onSwap} aria-label="Swap From and To" title="Swap From and To">
        <ArrowLeftRight className="size-3.5" />
      </Button>
      <NumericEndpoint which="to" kind={kind} endpoint={to} onChange={(next) => onChange('to', next)} />
    </div>
  )
}

/**
 * A typed number that commits only when it is one. The field keeps its own text: `Number('')` is
 * 0 and a browser reports a lone `-` as `''`, so a controlled number over the endpoint's value
 * would write 0 to a live rig the moment the operator cleared the field to retype it, and would
 * overwrite a leading minus before the digit after it could be typed — on the one editor whose
 * range runs both ways. The text follows the value when the value moves from outside (Swap, a
 * seed), and is left alone while it is only unfinished.
 */
function NumberField({
  label,
  value,
  min,
  max,
  onCommit,
  className,
}: {
  label: string
  value: number
  min?: number
  max?: number
  onCommit: (value: number) => void
  className?: string
}) {
  const [text, setText] = useState(String(value))
  const committedRef = useRef(value)
  useEffect(() => {
    if (value !== committedRef.current) {
      committedRef.current = value
      setText(String(value))
    }
  }, [value])
  return (
    <Input
      type="number"
      min={min}
      max={max}
      step={1}
      aria-label={label}
      value={text}
      onChange={(e) => {
        const raw = e.target.value
        setText(raw)
        if (raw.trim() === '') return
        const parsed = Number(raw)
        if (!Number.isFinite(parsed)) return
        const clamped = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, parsed))
        committedRef.current = clamped
        onCommit(clamped)
      }}
      className={className}
    />
  )
}

function NumericEndpoint({
  which,
  kind,
  endpoint,
  onChange,
}: {
  which: 'from' | 'to'
  kind: 'percent' | 'position' | 'level'
  endpoint: SpreadEndpoint
  onChange: (endpoint: SpreadEndpoint) => void
}) {
  const label = which === 'from' ? 'From' : 'To'
  const field = 'h-7 px-1.5 text-xs tabular-nums'
  if (kind === 'position') {
    const pan = endpoint.kind === 'position' ? endpoint.panDeg : 0
    const tilt = endpoint.kind === 'position' ? endpoint.tiltDeg : 0
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <BuskLabel>{label}</BuskLabel>
        <div className="flex items-center gap-1">
          <NumberField label={`${label} pan, degrees`} value={pan} onCommit={(next) => onChange({ kind: 'position', panDeg: next, tiltDeg: tilt })} className={field} />
          <span className="text-[10px] text-muted-foreground">/</span>
          <NumberField label={`${label} tilt, degrees`} value={tilt} onCommit={(next) => onChange({ kind: 'position', panDeg: pan, tiltDeg: next })} className={field} />
        </div>
      </div>
    )
  }
  const max = kind === 'percent' ? 100 : 255
  const value = endpoint.kind === 'percent' || endpoint.kind === 'level' ? endpoint.value : 0
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <BuskLabel>{label}</BuskLabel>
      <div className="flex items-center gap-1">
        <NumberField
          label={kind === 'percent' ? `${label}, percent` : `${label}, 0–255`}
          value={value}
          min={0}
          max={max}
          onCommit={(next) => onChange(kind === 'percent' ? { kind: 'percent', value: next } : { kind: 'level', value: Math.round(next) })}
          className={field}
        />
        {kind === 'percent' && <span className="text-[10px] text-muted-foreground">%</span>}
      </div>
    </div>
  )
}

// ─── The curve pictures ─────────────────────────────────────────────────────

/** The four shapes drawn as the tab draws them: eight heads, From at the baseline, To at the top. */
function CurvePicture({ curve }: { curve: SpreadCurve }) {
  const heads = 8
  const t = (i: number): number => {
    const x = i / (heads - 1)
    switch (curve) {
      case 'LINE':
        return x
      case 'MIRROR':
        return Math.abs(2 * x - 1)
      case 'ARROW':
        return 1 - Math.abs(2 * x - 1)
      case 'WINGS': {
        // Two fans meeting at the centre: To at each outer end, From in the middle.
        const half = heads / 2
        return i < half ? 1 - i / (half - 1) : (i - half) / (half - 1)
      }
    }
  }
  const points = Array.from({ length: heads }, (_, i) => `${2 + i * 4},${13 - t(i) * 11}`).join(' ')
  return (
    <svg aria-hidden viewBox="0 0 32 14" className="h-3.5 w-8">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ─── The preview strip ──────────────────────────────────────────────────────

/** How full a bar is for a written value of this editor's kind, 0–1, or null for a shape a fill cannot say (a position). */
function fillOf(value: string, kind: 'colour' | 'percent' | 'position' | 'level'): number | null {
  const intent = parseTemplateIntent(value)
  if (intent == null) return null
  if (kind === 'percent' && intent.kind === 'percent') return intent.value / 100
  if (kind === 'level' && intent.kind === 'level') return intent.value / 255
  return null
}

function barLabel(value: string): string {
  const intent = parseTemplateIntent(value)
  if (intent == null) return value
  switch (intent.kind) {
    case 'colour':
      return intent.hex.toUpperCase()
    case 'percent':
      return `${Math.round(intent.value)}`
    case 'level':
      return String(intent.value)
    case 'position':
      return `${Math.round(intent.panDeg)}/${Math.round(intent.tiltDeg)}`
    case 'switch':
      return intent.on ? 'on' : 'off'
  }
}

function PreviewStrip({ bars, kind, compact }: { bars: PreviewBar[]; kind: 'colour' | 'percent' | 'position' | 'level'; compact: boolean }) {
  return (
    <div data-spread-preview className={cn('mt-1 flex items-end gap-0.5 overflow-x-auto', compact ? 'h-10' : 'h-14')}>
      {bars.map((bar) => (
        <div
          key={bar.key}
          data-spread-bar={bar.key}
          data-spread-skipped={bar.skipped != null ? 'true' : undefined}
          title={bar.skipped != null ? `${bar.name}: ${bar.skipped}` : `${bar.name}: ${bar.values.map(barLabel).join(' · ')}`}
          className={cn('flex h-full min-w-4 flex-1 flex-col justify-end', bar.skipped != null && 'opacity-30')}
        >
          <div className="flex h-full items-end gap-px">
            {bar.skipped != null ? (
              <div className="h-full w-full rounded-sm border border-dashed border-border" />
            ) : (
              bar.values.map((value, index) => {
                const intent = parseTemplateIntent(value)
                const fill = fillOf(value, kind)
                const colour = intent?.kind === 'colour' ? intent.hex : null
                return (
                  <div
                    key={index}
                    data-spread-segment
                    className={cn('w-full rounded-sm', colour == null && 'bg-primary/70')}
                    style={{ height: `${Math.round((colour != null ? 1 : (fill ?? 0.5)) * 100)}%`, background: colour ?? undefined }}
                  />
                )
              })
            )}
          </div>
          <span className="truncate text-center text-[9px] leading-tight text-muted-foreground">
            {bar.skipped != null ? '—' : bar.values.length === 1 ? barLabel(bar.values[0]) : bar.name}
          </span>
        </div>
      ))}
    </div>
  )
}

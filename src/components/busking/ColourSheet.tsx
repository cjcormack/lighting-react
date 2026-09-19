import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pipette, Save, Waves } from 'lucide-react'
import { toast } from 'sonner'
import { lightingApi } from '@/api/lightingApi'
import type { TemplateSummary } from '@/api/templatesApi'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ColourPickerBody, type ColourChannels } from '@/components/fixtures/ColourPickerBody'
import { FixtureAppearanceSource } from '@/components/fixtures/fixtureAppearance'
import type { WriteTarget } from '@/components/fixtures-list/rowModel'
import { NewTemplateFromSelectionSheet } from '@/components/programmer/NewTemplateFromSelectionSheet'
import { useTemplatePress } from '@/components/programmer/useTemplatePress'
import { useCellEditorCramped } from '@/components/sheet/cells/CellEditorSurface'
import { useLivePush } from '@/hooks/useLivePush'
import { useFixtureLookup } from '@/hooks/useFixtureLookup'
import { formatFamilyList, type AttributeFamily } from '@/lib/attributeFamily'
import { effectiveRig } from '@/lib/buskRig'
import { computeCombinedCss } from '@/lib/colourMath'
import { hexToRgb, rgbToHex } from '@/components/fx/colourUtils'
import {
  LiveAppearanceReporter,
  pickSelectionColour,
  rigHeadOrder,
  selectedHeads,
  type PickedColour,
} from '@/lib/liveAppearance'
import { getProgrammerFadeMs } from '@/lib/programmerFade'
import { recentTemplates } from '@/lib/templateRecents'
import { cn } from '@/lib/utils'
import { useBuskRigQuery } from '@/store/busk'
import { useGroupListQuery } from '@/store/groups'
import { usePatchListQuery } from '@/store/patches'
import { useTemplateListQuery } from '@/store/templates'
import type { Fixture, ColourPropertyDescriptor } from '@/store/fixtures'
import { templateSwatch } from './padFace'
import { BuskLabel } from './BuskLabel'
import { lookLayerTarget, selectedHeadCount, type BuskingTarget } from './buskingTypes'

/**
 * The side sheet's **Colour** tab (busk-further plan D8; `Sheets.dc.html` §Colour): the colour
 * editor's body — the picker, the typed R/G/B, the emitter rows — hosted in the sheet rather than a
 * popover, writing to the selection as it is dragged.
 *
 * **It writes literals to Local, and only that.** Every drag is `programmer.setColour` per selected
 * target — a group as a group write, a cell by its element key — which is what a template pad's
 * click does and what the programmer's colour cell does. There is **no layer arm and no ⌥ arm**: a
 * picked colour has no library referent for a layer to follow, so *Save as template…* is the route
 * to something trackable, through the same `POST /templates/from-programmer` the strip uses. The
 * writes go through {@link useLivePush}, the tempo fader's discipline over six bytes.
 *
 * **The family mask is not consulted.** The desk's mask gates *presses*, and a colour drag is a
 * value write like a cell edit, so the sheet does not refuse under a Position marquee — but the
 * header says what it is about to do (*Colour of 14 heads · writes to Local*) and reads the family
 * pill, which is the honest answer the programmer's Set gives. A Recent chip is a *press*, and
 * goes through `useTemplatePress` under the mask like any other.
 *
 * **Recent** is the template recents row (`lib/templateRecents.ts`, colour family only): a tap is a
 * template **apply**, so it stamps `lastPressedAt` and lands as literals like the chip. No new list,
 * no new order. **Pick** reads the selection's current colour off `lib/liveAppearance.ts` — the
 * report every appearance leaf makes, since `FixtureAppearanceSource` is a render prop and cannot
 * be asked from a click — into the picker without writing; the first head in rig order wins, and
 * the field says *mixed* where the selection disagrees. The tab mounts a hidden leaf per selected
 * head so Pick answers in every focus, not only while the rig tiles are on screen.
 *
 * **The emitter rows are the selection's union, read off the colour descriptors** — the emitters a
 * `setColour` can drive, which is the only write this sheet makes — with the count of heads that
 * take any; a head with no white simply drops its byte, as a colour cell commit already does. The
 * probe is deliberately narrower than `targetEmitters`' (which also counts a plain slider in an
 * emitter category, for the template offer): a row for an emitter this write cannot reach would be
 * a slider that moves nothing.
 *
 * **The buffer is seeded from the rig** — a Pick on mount and on every selection change — so that
 * a single-channel edit means what it means in the cell editor: the other RGB bytes are left
 * *where the rig has them*, not at a neutral the sheet made up. The three emitters start at 0
 * whatever the rig holds, because the appearance store exposes one folded colour and nothing per
 * emitter; a typed byte over an amber the rig is holding sends that amber as 0, as Pick does. And **the release is read from the
 * window**, as the tempo fader's is: react-colorful binds its own release to the document, so a
 * drag let go outside the sheet still ends the gesture here rather than leaving a stale flag for
 * the next pointer to flush.
 *
 * The *Spread to a second colour…* button hands the current channels to `onSpread`, and the Spread tab's
 * *From* is their **RGB** — a colour intent has no emitter component, so a white or amber this tab
 * was driving does not travel (`SpreadSeed` in `SpreadSheet.tsx` says the same). The side sheet's
 * two hosts wire it (`SideSheet.tsx`'s `useSpreadSeed`), and a host with no Spread tab to open
 * leaves it out, which draws the button inert.
 */

export interface ColourSheetProps {
  projectId: number
  selectedTargets: Map<string, BuskingTarget>
  /** The selection's attribute mask, for the header's pill. Null is every attribute. */
  families: AttributeFamily[] | null
  /** Open the Spread tab with *From* set to the current colour. Absent, the button is inert. */
  onSpread?: (from: ColourChannels) => void
  /** Force the two-column layout; the cramped height query answers it otherwise. */
  compact?: boolean
}

/** One `programmer.setColour` the sheet sends for one selected target. */
export interface ColourWrite {
  targetType: 'fixture' | 'group'
  targetKey: string
  propertyName: string
  colour: { r: number; g: number; b: number; w?: number; a?: number; uv?: number }
  /** Names the group a per-member write came from — a fan-out that could not be a group write. */
  sourceGroup?: string
}

const EMPTY_SELECTION_TOAST = 'colour-sheet-empty-selection'
const NEUTRAL: ColourChannels = { r: 255, g: 255, b: 255, w: 0, a: 0, uv: 0 }

function colourDescriptorOf(properties: readonly { type: string }[]): ColourPropertyDescriptor | null {
  return (properties.find((p) => p.type === 'colour') as ColourPropertyDescriptor | undefined) ?? null
}

/** Every colour descriptor a head writes through: its own, or its cells'. */
function colourDescriptorsOf(fixture: Fixture): ColourPropertyDescriptor[] {
  const own = colourDescriptorOf(fixture.properties)
  if (own != null) return [own]
  return (fixture.elements ?? []).map((element) => colourDescriptorOf(element.properties)).filter((d): d is ColourPropertyDescriptor => d != null)
}

/** Which emitters a descriptor can take, as a comparable key. */
function emitterShape(descriptor: ColourPropertyDescriptor): string {
  return `${descriptor.whiteChannel ? 'w' : '-'}${descriptor.amberChannel ? 'a' : '-'}${descriptor.uvChannel ? 'u' : '-'}`
}

/** The colour a head can take: RGB always, an emitter only where its descriptor has the channel. */
function colourFor(channels: ColourChannels, descriptor: ColourPropertyDescriptor): ColourWrite['colour'] {
  let { r, g, b } = channels
  // The picker's pure-white branch emits `0,0,0,w=255` for a selection whose union has white; a
  // head without one would go black instead of white, so the undeliverable white is folded back
  // into RGB — `useCellWriters.writeColour`'s rule.
  if (channels.w > 0 && descriptor.whiteChannel == null) {
    r = Math.max(r, channels.w)
    g = Math.max(g, channels.w)
    b = Math.max(b, channels.w)
  }
  return {
    r,
    g,
    b,
    w: descriptor.whiteChannel ? channels.w : undefined,
    a: descriptor.amberChannel ? channels.a : undefined,
    uv: descriptor.uvChannel ? channels.uv : undefined,
  }
}

/** A whole fixture's writes: one on its own colour, or one per cell for a bar whose colour lives on its cells. */
function fixtureWrites(fixture: Fixture, channels: ColourChannels, sourceGroup?: string): ColourWrite[] {
  const own = colourDescriptorOf(fixture.properties)
  if (own != null) {
    return [{ targetType: 'fixture', targetKey: fixture.key, propertyName: own.name, colour: colourFor(channels, own), sourceGroup }]
  }
  const writes: ColourWrite[] = []
  for (const element of fixture.elements ?? []) {
    const descriptor = colourDescriptorOf(element.properties)
    if (descriptor != null) {
      writes.push({ targetType: 'fixture', targetKey: element.key, propertyName: descriptor.name, colour: colourFor(channels, descriptor), sourceGroup })
    }
  }
  return writes
}

/**
 * The writes one colour becomes over a selection: a fixture as one write (or one per cell, for a
 * pixel bar whose colour lives on its cells), a cell as one write by its element key, and a group
 * as **one group write where its members agree on emitters** — otherwise one write per member,
 * each carrying `sourceGroup`. A head with no colour at all contributes nothing.
 *
 * The group rule is forced by the desk: `writeGroupProperty` fans one colour to every member and
 * `resolveColour` writes R/G/B verbatim, adding white only on a head that has one — it can fold an
 * undeliverable white into RGB for none of them. So pure white (`0,0,0,w255`, which the picker emits
 * because the emitter rows are a union) sent as a group write to a group holding an RGBW and an
 * RGB head would set the RGB head to black. Per-member writes put the fold where it can be made,
 * and `sourceGroup` keeps the group's name on each, which is what that field exists for.
 */
export function planColourWrites(
  selected: readonly BuskingTarget[],
  channels: ColourChannels,
  fixtures: readonly Fixture[] | undefined,
): ColourWrite[] {
  const writes: ColourWrite[] = []
  for (const target of selected) {
    if (target.type === 'group') {
      const members = (fixtures ?? []).filter((fixture) => fixture.groups.includes(target.name))
      const descriptors = members.flatMap(colourDescriptorsOf)
      if (descriptors.length === 0) continue
      const shapes = new Set(descriptors.map(emitterShape))
      if (shapes.size === 1) {
        writes.push({
          targetType: 'group',
          targetKey: target.name,
          propertyName: descriptors[0].name,
          colour: colourFor(channels, descriptors[0]),
        })
      } else {
        for (const member of members) writes.push(...fixtureWrites(member, channels, target.name))
      }
      continue
    }
    if (target.element != null) {
      const descriptor = colourDescriptorOf(target.element.properties)
      if (descriptor != null) {
        writes.push({ targetType: 'fixture', targetKey: target.element.key, propertyName: descriptor.name, colour: colourFor(channels, descriptor) })
      }
      continue
    }
    writes.push(...fixtureWrites(target.fixture, channels))
  }
  return writes
}

/**
 * The selection as the emitter probe reads it — a group as its members, a cell as itself. Exported
 * for the Spread tab, whose family segment asks the same `targetFamilies` question of the same
 * expansion, so the two tabs cannot count a selection's heads two ways.
 */
export function writeTargetsOf(selected: readonly BuskingTarget[], fixtures: readonly Fixture[] | undefined): WriteTarget[] {
  const out: WriteTarget[] = []
  for (const target of selected) {
    if (target.type === 'group') {
      for (const fixture of fixtures ?? []) {
        if (fixture.groups.includes(target.name)) out.push({ key: fixture.key, properties: fixture.properties, elements: fixture.elements })
      }
    } else if (target.element != null) {
      out.push({ key: target.element.key, properties: target.element.properties })
    } else {
      out.push({ key: target.fixture.key, properties: target.fixture.properties, elements: target.fixture.elements })
    }
  }
  return out
}

export type ColourEmitter = 'white' | 'amber' | 'uv'
const COLOUR_EMITTERS: readonly ColourEmitter[] = ['white', 'amber', 'uv']

/**
 * How many of the write targets take each emitter **through their colour descriptor**, and how
 * many take any — the one probe behind both the emitter rows and the *Emitters on 6 of 14 heads*
 * line, so the two cannot disagree.
 */
export function emitterHeadCounts(targets: readonly WriteTarget[]): Record<ColourEmitter | 'any', number> {
  const counts = { white: 0, amber: 0, uv: 0, any: 0 }
  for (const target of targets) {
    const descriptors = [target.properties, ...(target.elements ?? []).map((e) => e.properties)]
      .map(colourDescriptorOf)
      .filter((d): d is ColourPropertyDescriptor => d != null)
    const white = descriptors.some((d) => d.whiteChannel != null)
    const amber = descriptors.some((d) => d.amberChannel != null)
    const uv = descriptors.some((d) => d.uvChannel != null)
    if (white) counts.white += 1
    if (amber) counts.amber += 1
    if (uv) counts.uv += 1
    if (white || amber || uv) counts.any += 1
  }
  return counts
}

const sameChannels = (a: ColourChannels, b: ColourChannels) =>
  a.r === b.r && a.g === b.g && a.b === b.b && a.w === b.w && a.a === b.a && a.uv === b.uv

export function ColourSheet({ projectId, selectedTargets, families, onSpread, compact }: ColourSheetProps) {
  const cramped = useCellEditorCramped()
  const isCompact = compact ?? cramped
  const selected = useMemo(() => [...selectedTargets.values()], [selectedTargets])
  const { fixtures, fixtureByKey, typeByKey } = useFixtureLookup()
  const { data: patches } = usePatchListQuery(projectId)
  const { data: groups } = useGroupListQuery()
  const { data: rig } = useBuskRigQuery(projectId)
  const { data: templates } = useTemplateListQuery({ projectId })

  const headCount = selectedHeadCount(selected)
  const writeTargets = useMemo(() => writeTargetsOf(selected, fixtures), [selected, fixtures])
  const emitterCounts = useMemo(() => emitterHeadCounts(writeTargets), [writeTargets])
  const emitters = useMemo(() => COLOUR_EMITTERS.filter((emitter) => emitterCounts[emitter] > 0), [emitterCounts])
  const hasWhite = emitters.includes('white')
  const hasAmber = emitters.includes('amber')
  const hasUv = emitters.includes('uv')

  // The heads Pick reads, in rig order — the built rig's, or the show-all fallback's, which is
  // the desk's own order for an empty rig.
  const heads = useMemo(() => {
    const order = rigHeadOrder(effectiveRig(rig, groups, fixtures).rows, fixtures)
    return selectedHeads(selected, order, fixtures)
  }, [selected, rig, groups, fixtures])
  const reportedKeys = useMemo(() => [...new Set(heads.map((head) => head.fixtureKey))], [heads])

  const [channels, setChannels] = useState<ColourChannels>(NEUTRAL)
  // Written by the handlers that move `channels`, never at render time: a fast drag can dispatch
  // its last move and its release inside one task with no render between, and a ref assigned
  // during render would hand the release the colour from the move before last — the speed rail's
  // `slideBpmRef` rule, for its reason.
  const channelsRef = useRef(channels)
  const [picked, setPicked] = useState<PickedColour | null>(null)
  /**
   * What the picker's knob is seeded from — **not** the live channels. The body re-seeds its knob
   * from `combinedCss` whenever it changes while open, and here it is always open; routing every
   * drag and typed byte back into that prop put `react-colorful` into a ping-pong that never
   * settled (see `ColourPickerBody`'s `combinedCss` note — found on the dev desk, at 20 writes a
   * second). So the seed moves only when the sheet means the knob to move: on Pick. A typed byte
   * leaves the knob where it is, which is the cell editor's own rule for typed values.
   */
  const [seed, setSeed] = useState<{ css: string; key: number }>({ css: computeCombinedCss(NEUTRAL.r, NEUTRAL.g, NEUTRAL.b, 0, 0, 0), key: 0 })
  const gestureRef = useRef(false)
  const layerTargets = useMemo(() => selected.map(lookLayerTarget), [selected])

  const { push, flush, reset } = useLivePush<ColourChannels>(
    (value) => {
      const fadeMs = getProgrammerFadeMs()
      for (const write of planColourWrites(selected, value, fixtures)) {
        lightingApi.programmer.setColour(write.targetType, write.targetKey, write.propertyName, write.colour, fadeMs, write.sourceGroup)
      }
    },
    { equals: sameChannels },
  )

  /**
   * Seed the buffer from the rig: what Pick reads, read for the operator. A fresh selection is a
   * fresh gesture — nothing the last one sent says where these heads are, so the dedupe is reset
   * and any gesture in flight is over — and its buffer starts where the rig is, which is what
   * makes a single-channel edit leave the other five where the rig has them rather than at a
   * neutral the sheet made up. The rig's heads may not have reported yet on the first render (the
   * patch list can still be arriving), so a seed that found nothing is retried as the heads change,
   * and a seed that found something is not repeated for that selection — a later refetch must not
   * snap the fields back under a colour the operator has since set.
   */
  const seededRef = useRef<{ key: string; done: boolean }>({ key: '', done: false })
  const selectionKey = useMemo(() => [...selectedTargets.keys()].join('|'), [selectedTargets])
  useEffect(() => {
    if (seededRef.current.key !== selectionKey) {
      seededRef.current = { key: selectionKey, done: false }
      gestureRef.current = false
      reset()
    }
    if (seededRef.current.done) return
    const result = pickSelectionColour(heads)
    if (result == null) return
    seededRef.current.done = true
    const rgb = hexToRgb(result.hex)
    const next: ColourChannels = { r: rgb.r, g: rgb.g, b: rgb.b, w: 0, a: 0, uv: 0 }
    channelsRef.current = next
    setChannels(next)
    setSeed((prev) => ({ css: computeCombinedCss(rgb.r, rgb.g, rgb.b, 0, 0, 0), key: prev.key + 1 }))
    setPicked(result)
  }, [selectionKey, heads, reset])

  const onColourChange = useCallback(
    (r: number, g: number, b: number, w?: number, a?: number, uv?: number) => {
      const next: ColourChannels = { r, g, b, w: w ?? 0, a: a ?? 0, uv: uv ?? 0 }
      channelsRef.current = next
      setChannels(next)
      setPicked(null)
      if (selected.length === 0) {
        // The strip's own sentence, keyed so a drag over nothing says it once rather than per frame.
        toast.error('Select the fixtures this should land on first', { id: EMPTY_SELECTION_TOAST })
        return
      }
      gestureRef.current = true
      push(next)
    },
    [selected.length, push],
  )

  // The release: whatever the finger let go on lands, past the floor — and only after a gesture
  // wrote something, so a pointer lifted after Pick does not turn the read into a write. Listened
  // for on the **window**, as the tempo fader's is: the picker binds its own release to the
  // document, so a drag let go outside the sheet never reaches a handler on it, and a flag left
  // standing would be flushed by the next pointer to land anywhere in the sheet.
  useEffect(() => {
    const onRelease = () => {
      if (!gestureRef.current) return
      gestureRef.current = false
      flush(channelsRef.current)
    }
    window.addEventListener('pointerup', onRelease)
    window.addEventListener('pointercancel', onRelease)
    return () => {
      window.removeEventListener('pointerup', onRelease)
      window.removeEventListener('pointercancel', onRelease)
    }
  }, [flush])

  const press = useTemplatePress(projectId, layerTargets, families)
  const recent = useMemo(() => {
    const offerable = (templates ?? []).filter(
      (t) =>
        t.family === 'COLOUR' &&
        t.kind === 'value' &&
        t.isGeneric &&
        (t.requiredEmitters ?? []).every((emitter) => (emitters as readonly string[]).includes(emitter)),
    )
    return recentTemplates(offerable)
  }, [templates, emitters])

  const pick = useCallback(() => {
    const result = pickSelectionColour(heads)
    if (result == null) {
      toast.info(selected.length === 0 ? 'Nothing selected to read a colour from' : 'No selected head is on screen to read')
      return
    }
    const rgb = hexToRgb(result.hex)
    const next: ColourChannels = { r: rgb.r, g: rgb.g, b: rgb.b, w: 0, a: 0, uv: 0 }
    channelsRef.current = next
    setChannels(next)
    setSeed((prev) => ({ css: computeCombinedCss(rgb.r, rgb.g, rgb.b, 0, 0, 0), key: prev.key + 1 }))
    setPicked(result)
  }, [heads, selected.length])

  const [saving, setSaving] = useState(false)
  const combinedCss = computeCombinedCss(channels.r, channels.g, channels.b, channels.w, channels.a, channels.uv)
  const hex = rgbToHex(channels.r, channels.g, channels.b)
  const withEmitters = emitterCounts.any
  const maskExcludesColour = families != null && families.length > 0 && !families.includes('COLOUR')

  return (
    <div
      data-colour-sheet={isCompact ? 'compact' : 'full'}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto border-l"
    >
      {/* Hidden leaves, one per selected head, so Pick can read a selection whose tiles are folded
          away. They draw nothing; the store is the output. */}
      <div hidden>
        {reportedKeys.map((key) => {
          const patch = patches?.find((p) => p.key === key)
          if (patch == null) return null
          const fixture = fixtureByKey.get(key)
          return (
            <FixtureAppearanceSource
              key={key}
              patch={patch}
              fixture={fixture}
              fixtureType={fixture == null ? undefined : typeByKey.get(fixture.typeKey)}
            >
              {(appearance) => <LiveAppearanceReporter fixtureKey={key} appearance={appearance} />}
            </FixtureAppearanceSource>
          )
        })}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-2.5 pb-2">
        <span data-colour-sheet-heading className="text-[11px] font-semibold">
          Colour of {headCount} {headCount === 1 ? 'head' : 'heads'}
          <span className="font-normal text-muted-foreground"> · writes to Local</span>
        </span>
        {families != null && families.length > 0 && (
          <Badge
            variant="outline"
            className="shrink-0 whitespace-nowrap border-primary/40 bg-primary/10 px-2 py-0 text-[10px] text-primary"
            title={
              maskExcludesColour
                ? 'The mask gates presses, not value writes: a drag here lands whatever the selection is masked to'
                : 'The selection’s attribute mask'
            }
          >
            {formatFamilyList(families, ' · ')}
          </Badge>
        )}
        <span
          aria-hidden
          className="ml-auto size-4 shrink-0 rounded-full border border-border"
          style={{ background: combinedCss }}
        />
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{hex}</span>
        {picked?.mixed && (
          <span data-colour-picked="mixed" className="text-[10px] text-amber-500" title="The selected heads disagree; the first in rig order is shown">
            mixed
          </span>
        )}
      </div>

      <div className={cn('px-3', isCompact ? 'pb-2' : 'pb-3')}>
        <ColourPickerBody
          r={channels.r}
          g={channels.g}
          b={channels.b}
          w={hasWhite ? channels.w : undefined}
          a={hasAmber ? channels.a : undefined}
          uv={hasUv ? channels.uv : undefined}
          combinedCss={seed.css}
          seedKey={seed.key}
          hasWhiteChannel={hasWhite}
          hasAmberChannel={hasAmber}
          hasUvChannel={hasUv}
          onColourChange={onColourChange}
          channelFields
          compact={isCompact}
          open
        />
        {emitters.length > 0 && (
          <p data-colour-emitters className="mt-2 text-[10px] text-muted-foreground">
            Emitters on {withEmitters} of {headCount} {headCount === 1 ? 'head' : 'heads'}
            {withEmitters < headCount ? ' · the rest take RGB only' : ''}
          </p>
        )}
      </div>

      <div className="border-t px-3 pt-2 pb-2">
        <BuskLabel>Recent from templates</BuskLabel>
        {recent.length === 0 ? (
          <p className="mt-1 text-[10px] text-muted-foreground">Colour templates you press show up here</p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {recent.map((template) => (
              <RecentChip key={template.id} template={template} onPress={() => press(template, false)} />
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t px-3 py-2">
        {/* A plain button, not a switch: it opens the Spread tab and holds no state of its own, so a
            `role="switch"` that never read checked promised a toggle it could not be. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={onSpread == null}
          title={onSpread == null ? 'No Spread tab to open from here' : 'Open the Spread tab with this colour as From'}
          onClick={() => onSpread?.(channels)}
        >
          <Waves className="size-3.5" /> Spread to a second colour…
        </Button>
        <span className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={selected.length === 0}
          title="Record the selection’s colour as a template — the route to something a layer can track"
          onClick={() => setSaving(true)}
        >
          <Save className="size-3.5" /> Save as template…
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          title="Read the selection’s current colour into the picker without writing"
          onClick={pick}
        >
          <Pipette className="size-3.5" /> Pick
        </Button>
      </div>

      <NewTemplateFromSelectionSheet
        open={saving}
        onOpenChange={setSaving}
        projectId={projectId}
        families={['COLOUR']}
        targets={layerTargets}
      />
    </div>
  )
}

function RecentChip({ template, onPress }: { template: TemplateSummary; onPress: () => void }) {
  const swatch = templateSwatch(template)
  return (
    <button
      type="button"
      data-recent-template={template.id}
      onClick={onPress}
      title={`Set “${template.name}” on the selection`}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-card px-2 text-xs hover:bg-accent"
    >
      {swatch != null && <span aria-hidden className="size-3 rounded-full border border-border" style={{ background: swatch }} />}
      <span className="max-w-[9rem] truncate">{template.name}</span>
    </button>
  )
}

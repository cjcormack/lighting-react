import type { BuskPad, BuskPadKind } from '@/api/buskApi'
import type { LookSummary } from '@/api/looksApi'
import type { TemplateSummary } from '@/api/templatesApi'
import { FAMILY_LABELS } from '@/lib/attributeFamily'
import { templateIntentSwatch } from '@/lib/templateIntent'
import { effectSpeedLabel } from '@/components/fx/fxConstants'
import { cn } from '@/lib/utils'
import type { EffectPresence } from './buskingTypes'

/**
 * Everything a pad draws, derived from the record the pad embeds.
 *
 * It is a plain object rather than a component's own reading because the **drag overlay needs the
 * same face without any hooks**: the ghost lives for a second, is rendered outside the pad's place
 * in the tree, and must not subscribe to anything. So `detail` here is always a finished string —
 * which is also why an effect template's live speed-master label is *not* in it. The pad itself
 * renders `EffectPadDetail` over the top; the ghost shows the frozen line and is none the worse.
 */
export interface PadFace {
  kind: BuskPadKind
  name: string
  /** The second line. Static — see the note above about the effect case. */
  detail: string
  /** A colour, for a generic single-row colour template. Null for everything else. */
  swatch: string | null
  isEffect: boolean
  /** Tooltip only: the mock has room for a name and one line, and a third pushed the pad taller. */
  notes: string | null
  cueNumber: string | null
  stackName: string | null
}

/**
 * A generic, single-row colour template's colour.
 *
 * The same two exclusions `isOfferable` makes in `FxColourTemplates.tsx`, for the same reason: a
 * per-fixture template holds one colour *per head*, so there is no single one to show, and a
 * multi-row template would have `rows[0]` stated under a name that covers all of them. An effect
 * template falls out through `rows.length !== 1` — it has none.
 */
export function templateSwatch(template: TemplateSummary): string | null {
  if (!template.isGeneric || template.rows.length !== 1) return null
  return templateIntentSwatch(template.rows[0].value)
}

/** `2 effects · 3 values`, or `empty`. */
export function describeLookContents(look: LookSummary): string {
  const parts: string[] = []
  if (look.effectCount > 0) {
    parts.push(`${look.effectCount} ${look.effectCount === 1 ? 'effect' : 'effects'}`)
  }
  if (look.rowCount > 0) {
    parts.push(`${look.rowCount} ${look.rowCount === 1 ? 'value' : 'values'}`)
  }
  return parts.length === 0 ? 'empty' : parts.join(' · ')
}

export function describeTemplate(template: TemplateSummary): string {
  if (template.kind === 'effect') {
    if (template.effect == null) return 'Effect'
    // No master label: that reads a live bank through a hook, and this string has to be renderable
    // by the overlay ghost. The pad draws `EffectPadDetail` over it and gains the `· M2`.
    const speed = effectSpeedLabel(template.effect.beatDivision, template.effect.timingSource)
    return [template.effect.effectType, speed].filter(Boolean).join(' · ')
  }
  if (!template.isGeneric) {
    return `${template.rows.length} ${template.rows.length === 1 ? 'head' : 'heads'}`
  }
  return template.family != null ? FAMILY_LABELS[template.family].singular : 'value'
}

const EMPTY_FACE: PadFace = {
  kind: 'TEMPLATE',
  name: 'Missing',
  detail: 'this record is gone',
  swatch: null,
  isEffect: false,
  notes: null,
  cueNumber: null,
  stackName: null,
}

/**
 * The face for a pad.
 *
 * The record is embedded in the pad by the server, so this needs no lookup and no second fetch —
 * and an unresolvable pad (which the server drops rather than serves, but an optimistic local one
 * could be mid-flight) still draws something rather than throwing.
 */
export function padFaceOf(pad: BuskPad): PadFace {
  if (pad.kind === 'TEMPLATE' && pad.template != null) {
    return {
      kind: 'TEMPLATE',
      name: pad.template.name,
      detail: describeTemplate(pad.template),
      swatch: templateSwatch(pad.template),
      isEffect: pad.template.kind === 'effect',
      notes: pad.template.notes,
      cueNumber: null,
      stackName: null,
    }
  }
  if (pad.kind === 'LOOK' && pad.look != null) {
    return {
      kind: 'LOOK',
      name: pad.look.name,
      detail: describeLookContents(pad.look),
      swatch: null,
      isEffect: false,
      notes: pad.look.notes,
      cueNumber: null,
      stackName: null,
    }
  }
  if (pad.kind === 'CUE' && pad.cue != null) {
    return {
      kind: 'CUE',
      name: pad.cue.name,
      detail: pad.cue.cueStackName,
      swatch: null,
      isEffect: false,
      notes: null,
      cueNumber: pad.cue.cueNumber,
      stackName: pad.cue.cueStackName,
    }
  }
  return { ...EMPTY_FACE, kind: pad.kind }
}

/**
 * The presence ladder: how much of the selection a record covers, as a shell.
 *
 * Here rather than in `BuskPad.tsx` because three surfaces draw it and must not drift: the pad, its
 * drag ghost (so a lifted pad looks like itself), and the FX cue-slot overlay's Look tile
 * (`slotLitClass`). A tweak to the ring belongs in this one function.
 */
export function padPresenceClass(presence: EffectPresence): string {
  return cn(
    presence === 'none' && 'border-border bg-card',
    presence === 'some' && 'border-primary/40 bg-primary/10',
    presence === 'all' && 'border-primary bg-primary/20 ring-1 ring-primary/50',
  )
}

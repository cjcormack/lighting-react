import { computeCombinedCss } from '../../lib/colourMath'
import { resolveSettingOption } from '../../hooks/usePropertyValues'
import type { CellResolution } from './columns'
import type { CellValue } from './useRowValues'
import type { CellOwnership, CellPaletteRef, StagedValue } from './useRowOwnership'

/**
 * Ownership styling for a programmer-sheet cell.
 *
 * Deliberately ring + text tint only, layered *around* the existing cell renderers rather
 * than inside them: the four cell editors already encode value shape (fill bars, swatches,
 * crosshairs), and re-tinting their internals would fight that. What the operator needs
 * here is "who owns this", not a second value language.
 *
 * The vocabulary follows the console convention the redesign is built on:
 * - **parked** is loud, because it is the one state where the rig ignores every edit;
 * - **programmer** is the accent colour — this is yours, and it is what Record will take;
 * - **effect** and **cue** are informational tints for values you are sitting on top of;
 * - **baseline** is dimmed, signalling "nothing asserts this".
 */
export function ownershipCellClass(ownership?: CellOwnership): string {
  if (!ownership) return ''
  // A *broken* reference overrides the ownership colour: the cell is showing the last value the
  // palette resolved to, which is indistinguishable from a healthy one until something says so.
  // A healthy reference deliberately gets no new colour — the four ownership colours are already
  // a learned vocabulary, and the reference marker is a separate, additive signal.
  if (ownership.paletteRef && !ownership.paletteRef.resolved) {
    return 'rounded-sm ring-1 ring-inset ring-destructive bg-destructive/10'
  }
  const mixed = ownership.isUniform ? '' : ' border-dashed'
  switch (ownership.source) {
    case 'parked':
      return 'rounded-sm ring-1 ring-inset ring-amber-500 bg-amber-500/15' + mixed
    case 'programmer':
      return ownership.touched
        ? 'rounded-sm ring-1 ring-inset ring-primary bg-primary/10' + mixed
        : 'rounded-sm ring-1 ring-inset ring-primary/40' + mixed
    case 'effect':
      return 'rounded-sm ring-1 ring-inset ring-violet-500/50' + mixed
    case 'cue':
      return 'rounded-sm ring-1 ring-inset ring-sky-500/40' + mixed
    case 'baseline':
      return 'opacity-55'
  }
}

/** Hover text naming the owner, so the colours are learnable rather than decorative. */
export function ownershipTitle(ownership?: CellOwnership): string | undefined {
  if (!ownership) return undefined
  const base = (() => {
    switch (ownership.source) {
      case 'parked':
        return 'Parked — the rig ignores every layer here'
      case 'programmer':
        return ownership.owners.length > 0
          ? `Programmer (${ownership.owners.join(', ')})`
          : 'Programmer'
      case 'effect':
        return 'Effect'
      case 'cue':
        return 'Cue'
      case 'baseline':
        return 'Baseline — nothing asserts this'
    }
  })()
  const parts = [base]
  if (ownership.sourceGroup) parts.push(`via group ${ownership.sourceGroup}`)
  if (!ownership.isUniform) parts.push('mixed across this row')
  const ref = ownership.paletteRef
  if (ref) parts.push(describePaletteRef(ref))
  return parts.join(' · ')
}

/**
 * One clause naming what a cell's reference is doing. Shared by the hover title and the editor
 * popover so the two can't word it differently.
 */
export function describePaletteRef(ref: CellPaletteRef): string {
  if (!ref.resolved) {
    return ref.name
      ? `references “${ref.name}”, which no longer covers this — showing the last value it resolved to`
      : 'references a palette that no longer resolves — showing the last value it resolved to'
  }
  if (ref.mixed) return 'references more than one palette across this row'
  return ref.name ? `references “${ref.name}”` : 'references a palette'
}

/**
 * Substitute the programmer's staged value while blind is engaged.
 *
 * Blind gates the programmer out of the merge, so the live DMX the sheet normally shows is
 * whatever the cues and effects underneath are painting — not what the operator is building.
 * Without this, blind busking in the sheet would be invisible, which is the whole point of
 * the gesture.
 *
 * A palette reference needs no case here, and that is the design: a reference always resolves to
 * one of the same four literal shapes, so `useRowOwnership` stages the *resolved* literal and this
 * switch stays exhaustive over the four value kinds. There is deliberately no fifth `kind: 'ref'`
 * — references are decoration on a value, not a value.
 *
 * Only shapes that match the cell's own kind are substituted; a mismatch (which would mean
 * the programmer holds something the column doesn't render) falls through to the live value.
 * Derived fields — the combined CSS swatch, the normalised pad axes, the resolved wheel
 * option — are recomputed here rather than carried over, so the staged rendering is a real
 * preview and not the old value wearing new numbers.
 */
export function applyStagedValue(
  value: CellValue,
  staged: StagedValue | undefined,
  resolutions: readonly NonNullable<CellResolution>[],
): CellValue {
  if (!staged) return value
  const first = resolutions[0]
  switch (value.kind) {
    case 'slider':
      return staged.kind === 'level'
        ? { kind: 'slider', min: staged.value, max: staged.value, isUniform: true }
        : value
    case 'setting': {
      if (staged.kind !== 'level') return value
      const options =
        first && (first.kind === 'setting' || first.kind === 'colour-setting')
          ? first.property.options
          : []
      return {
        kind: 'setting',
        isUniform: true,
        level: staged.value,
        option: resolveSettingOption(options, staged.value),
      }
    }
    case 'colour': {
      if (staged.kind !== 'colour') return value
      // Keep undefined for components the fixture has no channel for, so the picker still
      // hides the W/A/UV sliders it would hide for the live value.
      const w = value.w !== undefined ? staged.w : undefined
      const a = value.a !== undefined ? staged.a : undefined
      const uv = value.uv !== undefined ? staged.uv : undefined
      return {
        kind: 'colour',
        isUniform: true,
        r: staged.r,
        g: staged.g,
        b: staged.b,
        w,
        a,
        uv,
        combinedCss: computeCombinedCss(staged.r, staged.g, staged.b, w, a, uv),
      }
    }
    case 'position': {
      if (staged.kind !== 'position' || !first || first.kind !== 'position') return value
      const panRange = first.panMax - first.panMin
      const tiltRange = first.tiltMax - first.tiltMin
      return {
        kind: 'position',
        isUniform: true,
        pan: staged.pan,
        tilt: staged.tilt,
        panNormalized: panRange > 0 ? (staged.pan - first.panMin) / panRange : 0.5,
        tiltNormalized: tiltRange > 0 ? (staged.tilt - first.tiltMin) / tiltRange : 0.5,
      }
    }
  }
}

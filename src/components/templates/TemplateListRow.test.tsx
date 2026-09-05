// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { describeShape } from './TemplateListRow'
import type { TemplateEffect, TemplateSummary } from '@/api/templatesApi'

/**
 * The library row's subtitle grammar.
 *
 * `describeShape` is pure and takes the three things the summary does not carry — the effect's
 * speed label and its master's — because those need the FX library and the live speed-master bank
 * to answer. Keeping them arguments is what lets the sentence be pinned without a store.
 */
function template(over: Partial<TemplateSummary> = {}): TemplateSummary {
  return {
    id: 1,
    uuid: 'u1',
    name: 'Amber Key',
    notes: null,
    fadeDurationMs: null,
    family: 'COLOUR',
    isGeneric: true,
    kind: 'value',
    rows: [
      { targetType: 'deferred', targetKey: '', propertyName: 'rgbColour', value: '#FF9D4A;policy=extract' },
    ],
    effect: null,
    layerCount: 0,
    buskPageCount: 0,
    ...over,
  }
}

function effect(over: Partial<TemplateEffect> = {}): TemplateEffect {
  return {
    effectType: 'Colour Pulse',
    category: 'colour',
    beatDivision: 2,
    blendMode: 'OVERRIDE',
    distribution: 'LINEAR',
    parameters: {},
    ...over,
  }
}

describe('describeShape — a value template', () => {
  it('says what it fits, per family', () => {
    // The interesting question about a value is which heads can take it.
    expect(describeShape(template({ family: 'COLOUR' }))).toBe('Generic · any fixture with colour')
    expect(describeShape(template({ family: 'INTENSITY' }))).toBe('Generic · any fixture with a dimmer')
    expect(describeShape(template({ family: 'POSITION' }))).toBe('Generic · any moving head')
    expect(describeShape(template({ family: 'BEAM' }))).toBe('Generic · any fixture with the beam role')
  })

  it('counts heads for a per-fixture template', () => {
    const rows = [
      { targetType: 'fixture' as const, targetKey: 'mover1', propertyName: 'position', value: 'deg:270,135' },
      { targetType: 'fixture' as const, targetKey: 'mover2', propertyName: 'position', value: 'deg:265,130' },
    ]
    expect(describeShape(template({ isGeneric: false, rows }))).toBe('Per fixture · 2 heads')
  })
})

describe('describeShape — an effect template', () => {
  it('says what it does: the effect, its speed and its master', () => {
    // An effect fits every head of its family by construction, so "which heads" is not the
    // interesting question — what it runs and how fast is.
    const row = template({ kind: 'effect', rows: [], effect: effect() })
    expect(describeShape(row, { speed: '1/2', master: 'M2 Chases' })).toBe(
      'Effect · Colour Pulse · 1/2 · M2 Chases',
    )
  })

  it('spells master 1 out rather than dropping the clause', () => {
    // `useSpeedMasterDisplay` returns null at master 1, which every *chip* reads as "draw nothing".
    // A subtitle is a sentence, so the commonest case must not silently lose a clause.
    const row = template({ kind: 'effect', rows: [], effect: effect() })
    expect(describeShape(row, { speed: '1 Bar', master: 'M1' })).toBe(
      'Effect · Colour Pulse · 1 Bar · M1',
    )
  })

  it('omits the speed while the library has not said what the units are', () => {
    // `TemplateEffect` carries no `timingSource`, so a bare `2` is "2 beats" or "2 seconds"
    // depending on an answer only the FX library holds. Saying nothing beats saying the wrong one.
    const row = template({ kind: 'effect', rows: [], effect: effect() })
    expect(describeShape(row, { speed: null, master: 'M1' })).toBe('Effect · Colour Pulse · M1')
  })

  it('degrades to the bare word when the effect has not arrived', () => {
    // The write boundary does not allow an effect template with no effect, so this is a
    // half-loaded cache rather than a real state — it must still render a row.
    expect(describeShape(template({ kind: 'effect', rows: [], effect: null }))).toBe('Effect')
  })
})

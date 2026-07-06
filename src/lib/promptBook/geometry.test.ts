import { describe, expect, it } from 'vitest'
import { cornersToRect, flattenCueOrder, moveRegionVertically, rectToStyle } from './geometry'
import type { CueStack, CueStackCueEntry } from '../../api/cueStacksApi'
import type { ShowDetails, ShowEntryDto } from '../../api/showApi'

describe('rectToStyle', () => {
  it('converts normalized coords to CSS percentages', () => {
    expect(rectToStyle({ page: 0, x: 0.06, y: 0.25, w: 0.88, h: 0.04 })).toMatchObject({
      left: '6%',
      top: '25%',
      width: '88%',
      height: '4%',
    })
  })
})

describe('moveRegionVertically', () => {
  const region = [
    { page: 0, x: 0.1, y: 0.3, w: 0.8, h: 0.05 },
    { page: 0, x: 0.1, y: 0.9, w: 0.8, h: 0.05 },
  ]

  it('moves every rect by the same delta', () => {
    const moved = moveRegionVertically(region, 0.02)
    expect(moved[0].y).toBeCloseTo(0.32)
    expect(moved[1].y).toBeCloseTo(0.92)
  })

  it('clamps downward movement so no rect leaves the page', () => {
    // Second rect can only move down by 0.05 before hitting the bottom.
    const moved = moveRegionVertically(region, 0.5)
    expect(moved[1].y).toBeCloseTo(0.95)
    expect(moved[0].y).toBeCloseTo(0.35)
  })

  it('clamps upward movement at the top edge', () => {
    const moved = moveRegionVertically(region, -0.9)
    expect(moved[0].y).toBeCloseTo(0)
    expect(moved[1].y).toBeCloseTo(0.6)
  })
})

describe('cornersToRect', () => {
  it('orders corners regardless of drag direction', () => {
    const r = cornersToRect(2, { x: 0.8, y: 0.6 }, { x: 0.2, y: 0.1 })
    expect(r).toMatchObject({ page: 2, x: 0.2, y: 0.1 })
    expect(r.w).toBeCloseTo(0.6)
    expect(r.h).toBeCloseTo(0.5)
  })

  it('applies a minimum size floor to a click without drag', () => {
    const r = cornersToRect(0, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 })
    expect(r.w).toBeGreaterThan(0)
    expect(r.h).toBeGreaterThan(0)
  })
})

describe('flattenCueOrder', () => {
  function cue(id: number, overrides: Partial<CueStackCueEntry> = {}): CueStackCueEntry {
    return {
      id,
      name: `cue-${id}`,
      sortOrder: 0,
      paletteSize: 0,
      presetCount: 0,
      adHocEffectCount: 0,
      autoAdvance: false,
      autoAdvanceDelayMs: null,
      fadeDurationMs: null,
      fadeCurve: 'LINEAR',
      cueNumber: null,
      notes: null,
      cueType: 'STANDARD',
      ...overrides,
    }
  }

  function stack(id: number, name: string, cues: CueStackCueEntry[]): CueStack {
    return { id, name, palette: [], loop: false, cues, activeCueId: null, canEdit: true, canDelete: true }
  }

  function entry(id: number, sortOrder: number, cueStackId: number | null, entryType: 'STACK' | 'MARKER' = 'STACK'): ShowEntryDto {
    return { id, entryType, sortOrder, label: null, cueStackId, cueStackName: null }
  }

  function show(entries: ShowEntryDto[]): ShowDetails {
    return { projectId: 1, activeEntryId: null, entries, canEdit: true }
  }

  const stacks = [
    stack(10, 'Act One', [cue(1, { cueNumber: '1' }), cue(2, { cueNumber: '2.5' })]),
    stack(11, 'Act Two', [cue(3)]),
  ]

  it('flattens STACK entries in show order, skipping markers', () => {
    const result = flattenCueOrder(
      show([entry(100, 1, 11), entry(101, 0, 10), entry(102, 2, null, 'MARKER')]),
      stacks,
    )
    expect(result.map((c) => c.cueId)).toEqual([1, 2, 3])
    expect(result[0]).toMatchObject({ stackId: 10, stackName: 'Act One', label: 'Q1' })
    expect(result[2]).toMatchObject({ stackId: 11, label: 'cue-3' })
  })

  it('excludes marker-type cues within a stack', () => {
    const withMarker = [stack(10, 'S', [cue(1), cue(2, { cueType: 'MARKER' }), cue(3)])]
    const result = flattenCueOrder(show([entry(100, 0, 10)]), withMarker)
    expect(result.map((c) => c.cueId)).toEqual([1, 3])
  })

  it('tolerates entries whose stack is missing', () => {
    const result = flattenCueOrder(show([entry(100, 0, 999), entry(101, 1, 10)]), stacks)
    expect(result.map((c) => c.cueId)).toEqual([1, 2])
  })

  it('returns empty for missing inputs', () => {
    expect(flattenCueOrder(undefined, stacks)).toEqual([])
    expect(flattenCueOrder(show([]), undefined)).toEqual([])
  })
})

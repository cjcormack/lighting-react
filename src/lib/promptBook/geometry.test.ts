import { describe, expect, it } from 'vitest'
import {
  clientRectsToRegion,
  cornersToRect,
  flattenCueOrder,
  flattenShowRows,
  mergeRectsByLine,
  moveRegionVertically,
  rectToStyle,
} from './geometry'
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

describe('mergeRectsByLine', () => {
  it('unions per-run slivers on the same line into one band', () => {
    const merged = mergeRectsByLine([
      { page: 0, x: 0.1, y: 0.2, w: 0.15, h: 0.02 },
      { page: 0, x: 0.25, y: 0.201, w: 0.2, h: 0.02 }, // adjacent run, tiny y jitter
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ page: 0, x: 0.1 })
    expect(merged[0].w).toBeCloseTo(0.35)
  })

  it('keeps separate lines separate', () => {
    const merged = mergeRectsByLine([
      { page: 0, x: 0.1, y: 0.2, w: 0.3, h: 0.02 },
      { page: 0, x: 0.1, y: 0.26, w: 0.3, h: 0.02 },
    ])
    expect(merged).toHaveLength(2)
  })

  it('does not snowball tightly-leaded lines into one band', () => {
    // Single-spaced script: line pitch ≈ 1.05× the glyph-box height. A midpoint±
    // tolerance test merged these; overlap-based bucketing keeps them apart.
    const merged = mergeRectsByLine([
      { page: 0, x: 0.1, y: 0.2, w: 0.3, h: 0.02 },
      { page: 0, x: 0.1, y: 0.221, w: 0.3, h: 0.02 },
      { page: 0, x: 0.1, y: 0.242, w: 0.3, h: 0.02 },
    ])
    expect(merged).toHaveLength(3)
  })

  it('splits a two-column line on a large horizontal gap (name | dialogue)', () => {
    const merged = mergeRectsByLine([
      { page: 0, x: 0.06, y: 0.2, w: 0.08, h: 0.02 }, // character name
      { page: 0, x: 0.4, y: 0.2, w: 0.3, h: 0.02 }, // dialogue, big gap before it
    ])
    expect(merged).toHaveLength(2)
    expect(merged[0].x).toBeCloseTo(0.06)
    expect(merged[1].x).toBeCloseTo(0.4)
  })

  it('groups rects by page', () => {
    const merged = mergeRectsByLine([
      { page: 0, x: 0.1, y: 0.9, w: 0.3, h: 0.02 },
      { page: 1, x: 0.1, y: 0.05, w: 0.3, h: 0.02 },
    ])
    expect(new Set(merged.map((r) => r.page))).toEqual(new Set([0, 1]))
  })
})

describe('clientRectsToRegion', () => {
  // Two stacked pages, each 100px wide × 200px tall, with a 20px gap between.
  const pages = [
    { page: 0, left: 0, top: 0, width: 100, height: 200 },
    { page: 1, left: 0, top: 220, width: 100, height: 200 },
  ]

  it('attributes a rect to the page containing its centre and normalizes', () => {
    const region = clientRectsToRegion([{ left: 10, top: 20, right: 50, bottom: 40 }], pages)
    expect(region).toHaveLength(1)
    expect(region[0]).toMatchObject({ page: 0 })
    expect(region[0].x).toBeCloseTo(0.1)
    expect(region[0].y).toBeCloseTo(0.1)
    expect(region[0].w).toBeCloseTo(0.4)
  })

  it('drops rects that fall in the inter-page gap', () => {
    // Centre at y≈210 is between page 0 (0–200) and page 1 (220–420).
    const region = clientRectsToRegion([{ left: 10, top: 205, right: 50, bottom: 215 }], pages)
    expect(region).toHaveLength(0)
  })

  it('discards zero-width slivers', () => {
    const region = clientRectsToRegion([{ left: 10, top: 20, right: 10.2, bottom: 40 }], pages)
    expect(region).toHaveLength(0)
  })

  it('keeps rects across both pages for a multi-page selection', () => {
    const region = clientRectsToRegion(
      [
        { left: 10, top: 180, right: 90, bottom: 195 }, // bottom of page 0
        { left: 10, top: 225, right: 90, bottom: 240 }, // top of page 1
      ],
      pages,
    )
    expect(new Set(region.map((r) => r.page))).toEqual(new Set([0, 1]))
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

describe('flattenShowRows', () => {
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

  function entry(
    id: number,
    sortOrder: number,
    cueStackId: number | null,
    entryType: 'STACK' | 'MARKER' = 'STACK',
  ): ShowEntryDto {
    return { id, entryType, sortOrder, label: null, cueStackId, cueStackName: null }
  }

  function show(entries: ShowEntryDto[]): ShowDetails {
    return { projectId: 1, activeEntryId: null, entries, canEdit: true }
  }

  it('keeps MARKER cues as separator rows and (single stack) emits no stack header', () => {
    const stacks = [
      stack(10, 'Act One', [
        cue(1, { cueNumber: '1' }),
        cue(2, { cueType: 'MARKER', name: 'Interval' }),
        cue(3),
      ]),
    ]
    const rows = flattenShowRows(show([entry(100, 0, 10)]), stacks)
    expect(rows.map((r) => r.type)).toEqual(['cue', 'separator', 'cue'])
    expect(rows[1]).toMatchObject({ type: 'separator', id: 2, name: 'Interval' })
    expect(rows.some((r) => r.type === 'header')).toBe(false)
  })

  it('emits a per-stack header only when the show spans more than one stack', () => {
    const stacks = [stack(10, 'Act One', [cue(1)]), stack(11, 'Act Two', [cue(2)])]
    const rows = flattenShowRows(show([entry(100, 0, 10), entry(101, 1, 11)]), stacks)
    expect(rows.map((r) => r.type)).toEqual(['header', 'cue', 'header', 'cue'])
    expect(rows.filter((r) => r.type === 'header').map((r) => (r.type === 'header' ? r.stackName : ''))).toEqual([
      'Act One',
      'Act Two',
    ])
  })

  it('orders by show-entry sortOrder and skips MARKER show-entries', () => {
    const stacks = [stack(10, 'A', [cue(1)]), stack(11, 'B', [cue(2)])]
    const rows = flattenShowRows(
      show([entry(100, 1, 11), entry(101, 0, 10), entry(102, 2, null, 'MARKER')]),
      stacks,
    )
    const cueIds = rows.flatMap((r) => (r.type === 'cue' ? [r.cue.cueId] : []))
    expect(cueIds).toEqual([1, 2])
  })

  it('returns empty for missing inputs', () => {
    expect(flattenShowRows(undefined, [])).toEqual([])
    expect(flattenShowRows(show([]), undefined)).toEqual([])
  })
})

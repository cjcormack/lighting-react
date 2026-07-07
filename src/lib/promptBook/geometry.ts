// Geometry helpers for the prompt-book overlay layer.
//
// All persisted geometry is normalized [0..1] against page dimensions — never
// pixels — so overlays survive zoom, resize, and re-display. Rendering is pure
// CSS percentages; only pointer interactions need a pixel conversion, always
// relative to the page element's current box.

import type { CSSProperties } from 'react'
import { clamp } from '../utils'
import type { Rect, Region } from '../../api/promptBooksApi'
import type { ShowDetails } from '../../api/showApi'
import type { CueStack } from '../../api/cueStacksApi'
import { scriptPosition, type FlatCue } from './desync'

/**
 * Fixed x (normalized) for the cue/cut margin band's right edge — a single lane
 * in the page's left margin so every marker's line + label align vertically,
 * regardless of where each annotated region's text starts. Assumes the script
 * leaves a normal left margin. The label extends left of this into the margin.
 */
export const MARKER_MARGIN_X = 0.04

/** Position a normalized rect inside a `position: relative` page wrapper. */
export function rectToStyle(r: Rect): CSSProperties {
  return {
    position: 'absolute',
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.w * 100}%`,
    height: `${r.h * 100}%`,
  }
}

/** Convert a client-space point to normalized page coords, clamped to [0,1]. */
export function clientPointToNormalized(
  clientX: number,
  clientY: number,
  pageEl: Element,
): { x: number; y: number } {
  const box = pageEl.getBoundingClientRect()
  const x = box.width > 0 ? (clientX - box.left) / box.width : 0
  const y = box.height > 0 ? (clientY - box.top) / box.height : 0
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) }
}

/**
 * Group items (anchors/annotations) by the pages their region touches, carrying
 * only the rects that sit on each page. One implementation for both overlay
 * kinds so page-membership rules can't drift between them.
 */
export function groupByPage<T>(
  items: T[],
  regionOf: (item: T) => Region,
): Map<number, { item: T; rects: Rect[] }[]> {
  const map = new Map<number, { item: T; rects: Rect[] }[]>()
  for (const item of items) {
    const region = regionOf(item)
    const pages = new Set(region.map((r) => r.page))
    for (const page of pages) {
      const rects = region.filter((r) => r.page === page)
      map.set(page, [...(map.get(page) ?? []), { item, rects }])
    }
  }
  return map
}

/**
 * Move every rect of a region vertically by `dy` (normalized), clamping the
 * delta so no rect leaves its page. The region moves as one unit — a page-break
 * span keeps its shape.
 */
export function moveRegionVertically(region: Region, dy: number): Region {
  let clamped = dy
  for (const r of region) {
    clamped = Math.max(clamped, -r.y)
    clamped = Math.min(clamped, 1 - r.h - r.y)
  }
  return region.map((r) => ({ ...r, y: r.y + clamped }))
}

/**
 * Vertical extent of a set of rects (all assumed on one page): the topmost y and
 * the total height down to the lowest edge. Used to draw a single gutter band that
 * spans everything a region touches on a page.
 */
export function verticalBounds(rects: Rect[]): { top: number; height: number } {
  if (rects.length === 0) return { top: 0, height: 0 }
  const top = Math.min(...rects.map((r) => r.y))
  const bottom = Math.max(...rects.map((r) => r.y + r.h))
  return { top, height: Math.max(bottom - top, 0) }
}

/** Order two rect corners into a normalized rect, with a minimum size floor. */
export function cornersToRect(
  page: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
  minSize = 0.005,
): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const w = Math.max(Math.abs(a.x - b.x), minSize)
  const h = Math.max(Math.abs(a.y - b.y), minSize)
  return { page, x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) }
}

/**
 * Flatten the show into the authoritative cue order the desync check walks:
 * STACK entries in show order, each contributing its STANDARD cues in stack
 * order. Markers contribute nothing; entries whose stack isn't loaded (or was
 * deleted) are tolerated and skipped.
 */
export function flattenCueOrder(
  show: ShowDetails | undefined,
  stacks: CueStack[] | undefined,
): FlatCue[] {
  if (!show || !stacks) return []
  const stackById = new Map(stacks.map((s) => [s.id, s]))
  const out: FlatCue[] = []
  const entries = [...show.entries].sort((a, b) => a.sortOrder - b.sortOrder)
  for (const entry of entries) {
    if (entry.entryType !== 'STACK' || entry.cueStackId == null) continue
    const stack = stackById.get(entry.cueStackId)
    if (!stack) continue
    for (const cue of stack.cues) {
      if (cue.cueType !== 'STANDARD') continue
      out.push({
        cueId: cue.id,
        label: cue.cueNumber ? `Q${cue.cueNumber}` : cue.name,
        name: cue.name,
        fadeMs: cue.fadeDurationMs,
        fadeCurve: cue.fadeCurve,
        stackId: stack.id,
        stackName: stack.name,
      })
    }
  }
  return out
}

/**
 * A human "roughly where on the page" phrase for a region — used as the live
 * cue's trigger-line stand-in in the rail, since the PDF has no text layer to
 * quote. Buckets the region's reading-position y into fifths of the page.
 * e.g. `{ page: 11, y: 0.5 }` → "middle of p. 12" (page index is 0-based).
 */
export function positionLabel(region: Region): string {
  if (region.length === 0) return ''
  const { page, y } = scriptPosition(region)
  const band =
    y < 0.2 ? 'top' : y < 0.4 ? 'upper' : y < 0.6 ? 'middle' : y < 0.8 ? 'lower' : 'bottom'
  return `${band} of p. ${page + 1}`
}

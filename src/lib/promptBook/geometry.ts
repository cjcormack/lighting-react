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
import type { FlatCue } from './desync'

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
        stackId: stack.id,
        stackName: stack.name,
      })
    }
  }
  return out
}

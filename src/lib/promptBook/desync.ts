// Desync detection for the prompt-book — ADVISORY ONLY. Nothing here reorders
// or blocks; we compute warnings, the operator decides.
//
// Two orderings that should agree in a clean prompt-book:
//   • cue-stack order  — authoritative sequence from the show (entries → stack cues)
//   • script position  — each anchor's (page, y) reading position
//
// Agreement means: advancing the stack moves you monotonically DOWN the script.
// Ported from src/prototypes/model.ts (the design-session spec) with numeric cue
// ids and per-stack grouping so a wholly unanchored stack collapses to one
// summary warning instead of one warning per cue.

import type { Rect, Region, CueAnchorDto, AnnotationDto } from '../../api/promptBooksApi'

/** One cue in the authoritative flattened show order (see geometry.flattenCueOrder). */
export interface FlatCue {
  cueId: number
  label: string
  stackId: number
  stackName: string
}

export type WarningKind = 'out-of-order' | 'anchor-in-cut' | 'unanchored-cue' | 'unanchored-stack'

export interface DesyncWarning {
  kind: WarningKind
  /** The cue the warning is about; for `unanchored-stack`, the stack's first cue. */
  cueId: number
  stackId: number
  message: string
}

/** Reading-order key for a region: earliest page, then topmost y. */
export function scriptPosition(region: Region): { page: number; y: number } {
  return region.reduce(
    (best, r) => (r.page < best.page || (r.page === best.page && r.y < best.y) ? { page: r.page, y: r.y } : best),
    { page: Infinity, y: Infinity },
  )
}

/** True if two rects overlap at all (same page, intersecting boxes). */
function rectsOverlap(a: Rect, b: Rect): boolean {
  if (a.page !== b.page) return false
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function regionsOverlap(a: Region, b: Region): boolean {
  return a.some((ra) => b.some((rb) => rectsOverlap(ra, rb)))
}

/**
 * Compute advisory warnings for a prompt-book against the authoritative cue order.
 * Recomputed reactively on every edit and on load — cheap enough to run in a memo.
 */
export function computeWarnings(
  anchors: CueAnchorDto[],
  annotations: AnnotationDto[],
  cueOrder: FlatCue[],
): DesyncWarning[] {
  const warnings: DesyncWarning[] = []
  const anchorByCue = new Map(anchors.map((a) => [a.cueId, a]))
  const cuts = annotations.filter((n) => n.kind === 'STRIKETHROUGH')

  // Stacks with no anchors at all collapse to one warning each, so an act that
  // simply hasn't been anchored yet doesn't bury real issues under per-cue noise.
  const unanchoredStackIds = new Set<number>()
  const cuesByStack = new Map<number, FlatCue[]>()
  for (const cue of cueOrder) {
    cuesByStack.set(cue.stackId, [...(cuesByStack.get(cue.stackId) ?? []), cue])
  }
  for (const [stackId, cues] of cuesByStack) {
    if (cues.every((c) => !anchorByCue.has(c.cueId))) {
      unanchoredStackIds.add(stackId)
      warnings.push({
        kind: 'unanchored-stack',
        cueId: cues[0].cueId,
        stackId,
        message: `${cues[0].stackName} has no anchors on the script (${cues.length} cue${cues.length > 1 ? 's' : ''}).`,
      })
    }
  }

  // Walk cues in stack order, requiring monotonic script position.
  let prev: { page: number; y: number } | null = null
  let prevLabel: string | null = null
  for (const cue of cueOrder) {
    const anchor = anchorByCue.get(cue.cueId)
    if (!anchor) {
      if (!unanchoredStackIds.has(cue.stackId)) {
        warnings.push({
          kind: 'unanchored-cue',
          cueId: cue.cueId,
          stackId: cue.stackId,
          message: `${cue.label} has no anchor on the script.`,
        })
      }
      continue
    }

    const pos = scriptPosition(anchor.region)
    if (prev && (pos.page < prev.page || (pos.page === prev.page && pos.y < prev.y))) {
      warnings.push({
        kind: 'out-of-order',
        cueId: cue.cueId,
        stackId: cue.stackId,
        message: `${cue.label} sits earlier in the script than ${prevLabel ?? 'the cue before it'}. Check anchor placement or stack order.`,
      })
    }
    prev = pos
    prevLabel = cue.label

    if (cuts.some((cut) => regionsOverlap(anchor.region, cut.region))) {
      warnings.push({
        kind: 'anchor-in-cut',
        cueId: cue.cueId,
        stackId: cue.stackId,
        message: `${cue.label} is anchored inside a cut section.`,
      })
    }
  }

  return warnings
}

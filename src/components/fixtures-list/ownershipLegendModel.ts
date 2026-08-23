import type { CellOwnershipSource } from './useRowOwnership'

/**
 * Operator-facing gloss for each ownership colour.
 *
 * `OWNERSHIP_LABELS` in `ownership.ts` names the source; this says what it *means for you*, which
 * is a different job — "You — Record takes this" is the sentence that makes the accent ring worth
 * learning, and it is not what belongs in a hover tooltip. `OwnershipLegend.test.ts` asserts the
 * two maps cover the same keys, so adding a source cannot leave the legend silently short of one.
 *
 * A plain module rather than exports from `OwnershipLegend.tsx` so the component file exports only
 * a component — see the React Refresh note in CLAUDE.md.
 */
export const LEGEND_GLOSS: Record<CellOwnershipSource, string> = {
  programmer: 'You — Record takes this',
  cue: 'Cue',
  effect: 'Effect',
  parked: 'Parked',
  baseline: 'Nothing asserts it',
}

/** Draw order — loudest claim first, "nothing" last. */
export const LEGEND_ORDER: readonly CellOwnershipSource[] = [
  'programmer',
  'cue',
  'effect',
  'parked',
  'baseline',
]

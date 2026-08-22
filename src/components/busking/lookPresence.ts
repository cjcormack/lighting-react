import type { CueTarget } from '@/api/cuesApi'
import type { ProgrammerLayer } from '@/store/programmer'
import type { EffectPresence } from './buskingTypes'

/**
 * Whether a Look is on the rig for a pad's selected targets, from the programmer's layer stack.
 *
 * This replaced a match on `FxInstance.presetId`, which was wrong in two ways at once. The toggle
 * route used to stamp the *Look* id into a field naming a `DaoFxPreset`, so the ring worked by
 * accident; nothing stamps it any more. And it could only ever see a Look that spawned effects — a
 * Look made of static rows lit no ring at all, however plainly it was on stage. A layer is the
 * honest source: it exists whether or not the Look contains an effect.
 *
 * One thing this deliberately cannot answer: a layer with **empty** `targets` applies the Look's own
 * bound rows, and whether those cover a given fixture is a server-side question (group expansion,
 * per-fixture resolution). Such layers therefore count as covering nothing here. A pad always sends
 * its targets, so this only arises for a layer some other surface added.
 */
export function lookLayerPresence(
  layers: readonly ProgrammerLayer[],
  targets: readonly CueTarget[],
  lookId: number,
): EffectPresence {
  if (targets.length === 0) return 'none'

  const covering = layers.filter((layer) => !layer.isPreview && layer.lookId === lookId)
  if (covering.length === 0) return 'none'

  let covered = 0
  for (const target of targets) {
    const hit = covering.some((layer) =>
      layer.targets.some((t) => t.type === target.type && t.key === target.key),
    )
    if (hit) covered++
  }

  if (covered === 0) return 'none'
  return covered === targets.length ? 'all' : 'some'
}

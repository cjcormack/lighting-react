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

  // Matched on the source being a **Look** with this id, not on the id alone: a template layer can
  // carry the same int PK from the other table, and a pad would then light for someone else's row.
  const covering = layers.filter(
    (layer) => !layer.isPreview && layer.source.kind === 'LOOK' && layer.source.id === lookId,
  )
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

/**
 * The same question for a **template** pad: does a layer applying this template cover the selection?
 *
 * A separate function rather than a parameter on [lookLayerPresence], because the two match on
 * different things: a Look layer is found by `source.id` *within the LOOK arm*, a template layer
 * within the TEMPLATE arm, and the two id spaces are different tables that can collide. Folding them
 * into one would need a kind argument at every call site to avoid exactly that.
 *
 * A template holds no effects, so this is the *only* way its pad can light: the running-effect
 * presence a Look's ring is read from has nothing to say about one.
 */
export function templateLayerPresence(
  layers: readonly ProgrammerLayer[],
  targets: readonly CueTarget[],
  templateId: number,
): EffectPresence {
  if (targets.length === 0) return 'none'

  const covering = layers.filter(
    (layer) => !layer.isPreview && layer.source.kind === 'TEMPLATE' && layer.source.id === templateId,
  )
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

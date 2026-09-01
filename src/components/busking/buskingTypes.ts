import type { GroupSummary, GroupActiveEffect } from '@/api/groupsApi'
import type { Fixture } from '@/store/fixtures'
import type { FixtureDirectEffect } from '@/store/fixtureFx'
import { targetKey } from '@/lib/targetKey'

export type BuskingTarget =
  | { type: 'group'; name: string; group: GroupSummary }
  | { type: 'fixture'; key: string; fixture: Fixture }

/**
 * A busking target as the programmer's **layer stack** addresses it.
 *
 * Deliberately the same shape `applyLook` sends and `computeLookPresence` reads: the ring and the
 * tap must agree on which layer a Look pad is talking about, and a group answering to its name in
 * one and its key in the other would light a pad that a tap then failed to clear.
 */
export function lookLayerTarget(target: BuskingTarget): { type: 'group' | 'fixture'; key: string } {
  return {
    type: target.type,
    key: target.type === 'group' ? target.name : target.key,
  }
}

/**
 * The shared `type:key` encoding, over the busking union — which carries the group's `name` where
 * every other target union carries `key`. Named apart from `targetKey` because the busking state
 * once also had a `targetKey` *field* on a programmer-target shape, and the two shadowed each other.
 */
export function buskingTargetKey(target: BuskingTarget): string {
  return targetKey({
    type: target.type,
    key: target.type === 'group' ? target.name : target.key,
  })
}

export type EffectPresence = 'all' | 'some' | 'none'

export type ActiveEffectContext =
  | { type: 'group'; groupName: string; effect: GroupActiveEffect }
  | { type: 'fixture'; fixtureKey: string; effect: FixtureDirectEffect }


/**
 * Effect names, folded for comparison — `"Colour Chase"`, `"colour_chase"` and `"ColourChase"` are
 * one effect. Still here after the busk view's effect pads went because `ActiveEffectSheet` compares
 * names this way, and that sheet outlived them: the Programmer's `FxSheet` mounts it too.
 */
export function normalizeEffectName(s: string): string {
  return s.toLowerCase().replace(/[\s_]/g, '')
}

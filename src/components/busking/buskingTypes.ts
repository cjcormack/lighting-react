import type {
  BlendMode,
  DistributionStrategy,
  ElementMode,
  GroupSummary,
  GroupActiveEffect,
} from '@/api/groupsApi'
import type { Fixture } from '@/store/fixtures'
import type { ActiveEffect, FixtureDirectEffect } from '@/store/fixtureFx'
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

/**
 * The library entry behind an effect type, matched the way `ActiveEffectSheet` matches it.
 *
 * **Normalised, not exact.** A running instance and a stored template both carry `effectType` as it
 * was written when the effect was minted, and that need not be spelled identically to the library
 * entry's `name` — which is the whole reason [normalizeEffectName] exists. An exact `===` lookup
 * therefore answers `undefined` for an effect the library really does have, and every caller reads
 * that as "still loading" and disables itself forever.
 *
 * `undefined` from here means one of two genuinely different things, and callers must tell them
 * apart: a `library` of `undefined` is *still arriving*, while a miss against a loaded library is an
 * effect type this desk's registry does not know.
 */
export function findEffectEntry<T extends { name: string }>(
  library: readonly T[] | undefined,
  effectType: string | null | undefined,
): T | undefined {
  if (library == null || effectType == null) return undefined
  const normalized = normalizeEffectName(effectType)
  return library.find((entry) => normalizeEffectName(entry.name) === normalized)
}

/**
 * Adapt an `/fx/active` row to the shape the busking parameter sheet edits.
 *
 * The two endpoints report the same instance under slightly different names — the group DTO
 * calls the spread `distribution` where the fixture DTO calls it `distributionStrategy` — so
 * the mapping is explicit rather than a cast.
 *
 * It lives here, beside the type it produces, because it has **two** callers now: `FxSheet`'s chip
 * and the FX-running band's row menu. Both offer Edit… on the same instance, and a second copy of
 * this would drift on exactly the two traps the comments below name — a distribution the Select
 * cannot render, and an Update that silently resets the effect to master 1.
 *
 * Note what it does *not* need: any fixture or group. It reads the `ActiveEffect` alone, which is
 * what lets the FX band offer Edit… without mounting the two list queries its docblock keeps it
 * clear of.
 */
export function toEffectContext(effect: ActiveEffect): ActiveEffectContext {
  const shared = {
    id: effect.id,
    effectType: effect.effectType,
    propertyName: effect.propertyName,
    beatDivision: effect.beatDivision,
    isRunning: effect.isRunning,
    phaseOffset: effect.phaseOffset,
    currentPhase: effect.currentPhase,
    parameters: effect.parameters,
    elementFilter: effect.elementFilter,
    stepTiming: effect.stepTiming,
    cueId: effect.cueId,
    // Explicit like everything else here: dropping this would hand the edit sheet a
    // master-less copy, and its Update would silently reset the effect to master 1.
    speedMasterUuid: effect.speedMasterUuid,
    rateSpeedMasterUuid: effect.rateSpeedMasterUuid,
  }
  if (effect.isGroupTarget) {
    return {
      type: 'group',
      groupName: effect.targetKey,
      effect: {
        ...shared,
        blendMode: effect.blendMode as BlendMode,
        // `LINEAR` is the vocabulary every other call site and the backend request shape use;
        // the DTO's own `LinearDistribution` class name is not a valid DistributionStrategy
        // and would reach the parameter sheet's Select as an unrecognised value.
        distribution: (effect.distributionStrategy ?? 'LINEAR') as DistributionStrategy,
        elementMode: effect.elementMode as ElementMode | null,
      },
    }
  }
  return {
    type: 'fixture',
    fixtureKey: effect.targetKey,
    effect: {
      ...shared,
      targetKey: effect.targetKey,
      blendMode: effect.blendMode,
      isGroupTarget: false,
      distributionStrategy: effect.distributionStrategy,
    },
  }
}

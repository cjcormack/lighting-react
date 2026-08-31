import type { GroupSummary, GroupActiveEffect } from '@/api/groupsApi'
import type { Fixture, SettingOption } from '@/store/fixtures'
import type { FixtureDirectEffect } from '@/store/fixtureFx'
import type { ProgrammerTargetType } from '@/store/programmer'
import { groupMemberFixtures, type FxPropertyTarget } from '@/lib/fxTargetProperties'
import { targetKey } from '@/lib/targetKey'

export type BuskingTarget =
  | { type: 'group'; name: string; group: GroupSummary }
  | { type: 'fixture'; key: string; fixture: Fixture }

/** The active effects on one selected target, as the pad's effect list reports them. */
export interface TargetEffectsData {
  key: string
  target: BuskingTarget
  groupEffects?: GroupActiveEffect[]
  fixtureDirectEffects?: FixtureDirectEffect[]
}

/** A busking target as the programmer addresses it. */
export function programmerTarget(target: BuskingTarget): {
  targetType: ProgrammerTargetType
  targetKey: string
} {
  return target.type === 'group'
    ? { targetType: 'group', targetKey: target.name }
    : { targetType: 'fixture', targetKey: target.key }
}

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

/** Whether one target already runs an effect of this (normalised) name. */
export function hasEffect(data: TargetEffectsData, normalizedName: string): boolean {
  const running = data.target.type === 'group' ? data.groupEffects : data.fixtureDirectEffects
  return (running ?? []).some((e) => normalizeEffectName(e.effectType) === normalizedName)
}

/** A busking target as the shared FX property module addresses it. */
export function fxPropertyTarget(
  target: BuskingTarget,
  fixtureList: Fixture[] | undefined,
): FxPropertyTarget {
  return target.type === 'group'
    ? {
        type: 'group',
        capabilities: target.group.capabilities,
        members: groupMemberFixtures(fixtureList, target.name),
      }
    : { type: 'fixture', fixture: target.fixture }
}

/**
 * The shared `type:key` encoding, over the busking union — which carries the group's `name` where
 * every other target union carries `key`. Named apart from `targetKey` because `useBuskingState`
 * also has a `targetKey` *field* on the programmer-target shape, and the two shadowed each other.
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

export interface PropertyButton {
  kind: 'setting' | 'slider'
  propertyName: string
  displayName: string
  effectType: string // "StaticSetting" or "StaticValue"
  options?: SettingOption[] // setting options (for quick picker)
  min?: number // slider range
  max?: number
}

export function normalizeEffectName(s: string): string {
  return s.toLowerCase().replace(/[\s_]/g, '')
}

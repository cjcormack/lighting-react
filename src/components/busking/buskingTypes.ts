import type { GroupSummary, GroupActiveEffect } from '@/api/groupsApi'
import type { Fixture, SettingOption } from '@/store/fixtures'
import type { FixtureDirectEffect } from '@/store/fixtureFx'
import { targetKey } from '@/lib/targetKey'

export type BuskingTarget =
  | { type: 'group'; name: string; group: GroupSummary }
  | { type: 'fixture'; key: string; fixture: Fixture }

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

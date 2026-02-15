import type { GroupSummary, GroupActiveEffect } from '@/api/groupsApi'
import type { Fixture } from '@/store/fixtures'
import type { FixtureDirectEffect } from '@/store/fixtureFx'

export type BuskingTarget =
  | { type: 'group'; name: string; group: GroupSummary }
  | { type: 'fixture'; key: string; fixture: Fixture }

export function targetKey(target: BuskingTarget): string {
  return target.type === 'group' ? `group:${target.name}` : `fixture:${target.key}`
}

export type EffectPresence = 'all' | 'some' | 'none'

export type ActiveEffectContext =
  | { type: 'group'; groupName: string; effect: GroupActiveEffect }
  | { type: 'fixture'; fixtureKey: string; effect: FixtureDirectEffect }

export function normalizeEffectName(s: string): string {
  return s.toLowerCase().replace(/[\s_]/g, '')
}

import { describe, expect, it } from 'vitest'
import {
  FOLLOW_RATIOS,
  SPEED_MASTER_USAGES,
  derivedBpm,
  followRatioOf,
  formatFollowRatio,
  isFollowing,
  resolveSpeedMasterForCategory,
  usageLabel,
} from './speedMasterModel'
import { EFFECT_CATEGORY_INFO } from '@/components/fx/fxConstants'

describe('usage vocabulary vs the effect library', () => {
  it('names only categories the effect library actually has', () => {
    // Not a coincidence to be kept in step by hand — a master's usage *is* an effect
    // `category`, because routing is the literal comparison `usage === effect.category`. A
    // usage naming a category no effect carries could never match anything, and the operator
    // would be offered a routing rule that silently does nothing.
    for (const usage of SPEED_MASTER_USAGES) {
      expect(EFFECT_CATEGORY_INFO[usage]).toBeDefined()
    }
  })

  it('excludes the two categories that cannot own a tempo', () => {
    // `controls` is settings sliders — a level has no beat. `composite` spans families, so no
    // single master is *the* default for it. Both land on master 1 through a null uuid, which
    // is what an unmatched category is defined to do. lighting7's SpeedMasterUsageVocabularyTest
    // asserts the same two exclusions on the server's copy of this list.
    expect(SPEED_MASTER_USAGES).not.toContain('controls')
    expect(SPEED_MASTER_USAGES).not.toContain('composite')
  })

  it('labels a usage the way the effect library labels the category', () => {
    expect(usageLabel('position')).toBe(EFFECT_CATEGORY_INFO.position.label)
    // A category minted by someone's own .fx.kts has no entry; print it rather than nothing.
    expect(usageLabel('sparkle')).toBe('sparkle')
    expect(usageLabel(null)).toBeNull()
  })
})

describe('follow ratios', () => {
  it('renders the five offered ratios as their glyphs', () => {
    expect(FOLLOW_RATIOS.map((r) => formatFollowRatio(r.num, r.den))).toEqual([
      '2×',
      '1×',
      '½',
      '⅓',
      '¼',
    ])
  })

  it('renders a ratio the chips do not offer rather than hiding it', () => {
    // The backend stores any positive pair (FU-SPEED-CUSTOM-RATIO), so one can arrive from a
    // script or an import. A surface that only knew the five would draw a linked master with
    // no ratio at all.
    expect(formatFollowRatio(3, 4)).toBe('3/4')
  })

  it('treats a half-set pair as manual', () => {
    // The server writes both columns or neither, so this is not a state it produces — but a
    // display that guessed a denominator would invent a tempo.
    expect(isFollowing({ followNum: 1, followDen: 2 })).toBe(true)
    expect(isFollowing({ followNum: 1, followDen: null })).toBe(false)
    expect(isFollowing({})).toBe(false)
    expect(followRatioOf({ followNum: 1, followDen: null })).toBeNull()
    expect(followRatioOf({ followNum: 1, followDen: 3 })).toEqual({ num: 1, den: 3 })
  })

  it('derives a follower tempo exactly at thirds', () => {
    // Ints rather than a stored float is what makes this exact — 120 * (1/3) via a rounded
    // 0.333 would read 39.96.
    expect(derivedBpm(120, 1, 3)).toBeCloseTo(40, 10)
    expect(derivedBpm(128, 1, 2)).toBe(64)
    expect(derivedBpm(90, 2, 1)).toBe(180)
  })
})

describe('resolveSpeedMasterForCategory', () => {
  const bank = [
    { uuid: 'm1', usage: null },
    { uuid: 'm2', usage: 'position' },
    { uuid: 'm3', usage: 'colour' },
  ]

  it('routes an effect to the master claiming its category', () => {
    expect(resolveSpeedMasterForCategory(bank, 'position')).toBe('m2')
    expect(resolveSpeedMasterForCategory(bank, 'colour')).toBe('m3')
  })

  it('falls back to master 1 for anything unclaimed', () => {
    // null is master 1 on every wire in this system, so these three are one answer, not three
    // failure modes: an untagged family, a composite effect, and a category a user's own
    // .fx.kts invented.
    expect(resolveSpeedMasterForCategory(bank, 'dimmer')).toBeNull()
    expect(resolveSpeedMasterForCategory(bank, 'composite')).toBeNull()
    expect(resolveSpeedMasterForCategory(bank, 'sparkle')).toBeNull()
    expect(resolveSpeedMasterForCategory(bank, null)).toBeNull()
    expect(resolveSpeedMasterForCategory(undefined, 'position')).toBeNull()
  })

  it('ignores a claimant with no uuid', () => {
    // The pre-load synthetic master 1 has a null uuid; stamping an effect with it would be
    // stamping nothing.
    expect(resolveSpeedMasterForCategory([{ uuid: null, usage: 'dimmer' }], 'dimmer')).toBeNull()
  })
})

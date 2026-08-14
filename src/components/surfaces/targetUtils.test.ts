import { describe, expect, it } from 'vitest'
import { describeTarget } from './targetUtils'

describe('describeTarget', () => {
  it('describes the existing target kinds', () => {
    expect(describeTarget({ type: 'fixtureProperty', fixtureKey: 'hex-1', propertyName: 'dimmer' }))
      .toBe('hex-1.dimmer')
    expect(describeTarget({ type: 'blackout' })).toBe('Blackout')
    expect(describeTarget({ type: 'setBank', deviceTypeKey: 'xtc', bank: 'layer-b' }))
      .toBe('Bank layer-b (xtc)')
  })

  it('describes a tempo binding with its configured range', () => {
    // The range is the part an operator needs to see: two bindings on the same master with
    // different windows behave very differently under the same finger.
    expect(
      describeTarget({
        type: 'speedMasterBpm',
        masterUuid: 'aaaa-2',
        minBpm: 90,
        maxBpm: 150,
      }),
    ).toBe('Speed master BPM · 90–150')

    expect(describeTarget({ type: 'speedMasterTap', masterUuid: 'aaaa-2' }))
      .toBe('Speed master tap')
  })

  it('marks an unkeyed tempo binding as master 1', () => {
    // null is master 1 everywhere in this feature; spelling it out beats an unexplained gap.
    expect(
      describeTarget({ type: 'speedMasterBpm', masterUuid: null, minBpm: 60, maxBpm: 180 }),
    ).toBe('Speed master BPM · 60–180 · M1')
    expect(describeTarget({ type: 'speedMasterTap', masterUuid: null }))
      .toBe('Speed master tap · M1')
  })

  it('unwraps a flash target recursively', () => {
    expect(
      describeTarget({
        type: 'flash',
        target: { type: 'groupProperty', groupName: 'front', propertyName: 'dimmer' },
      }),
    ).toBe('Flash front.dimmer')
  })
})

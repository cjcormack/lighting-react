import { describe, expect, it } from 'vitest'
import { describeSkips } from './maskPicker'
import type { ProgrammerSkip } from '@/store/programmerOps'

const skip = (reason: ProgrammerSkip['reason'], targetKey = 'hex-1'): ProgrammerSkip => ({
  targetKey,
  propertyName: 'dimmer',
  reason,
})

describe('describeSkips', () => {
  it('says nothing when nothing was skipped', () => {
    expect(describeSkips([])).toBeNull()
  })

  it('groups by reason and counts', () => {
    const note = describeSkips([
      skip('MASKED_OUT', 'hex-1'),
      skip('MASKED_OUT', 'hex-2'),
      skip('MISSING_FIXTURE', 'gone-1'),
    ])
    expect(note).toContain('2 entries outside the attribute mask')
    expect(note).toContain('1 fixtures no longer in the patch')
  })

  it('names the unrecordable raw-channel case', () => {
    // The one skip an operator can't fix by re-recording: a channel with no backing property
    // has no (target, property) a cue assignment could name.
    expect(describeSkips([{ universe: 0, channel: 100, reason: 'NO_BACKING_PROPERTY' }])).toContain(
      'raw channels with no backing property',
    )
  })
})

import { describe, expect, it } from 'vitest'
import {
  describeIncludedTarget,
  includedCueId,
  includedTargetIsReadOnly,
  includedTargetKey,
} from './includedTarget'
import type { IncludedTarget } from '@/api/programmerWsApi'

const CUE: IncludedTarget = { kind: 'CUE', cueId: 4, cueNumber: '2.1', cueName: 'Warm wash' }
const LOOK: IncludedTarget = { kind: 'LOOK', lookId: 7, lookName: 'Warm Amber' }

describe('describeIncludedTarget', () => {
  it('names a cue by number and name', () => {
    expect(describeIncludedTarget(CUE)).toBe('2.1 · Warm wash')
  })

  it('names a look', () => {
    expect(describeIncludedTarget(LOOK)).toBe('Warm Amber')
  })

  it('falls back to the id when the server sent no name', () => {
    expect(describeIncludedTarget({ kind: 'CUE', cueId: 9 })).toBe('Cue 9')
    expect(describeIncludedTarget({ kind: 'LOOK', lookId: 9 })).toBe('Look 9')
  })

  it('still names a legacy palette target rather than falling through to the cue arm', () => {
    // Nothing in this client includes a palette any more, but the arm is still on the wire and a
    // stale target set by another client would otherwise read "Cue undefined".
    expect(describeIncludedTarget({ kind: 'PALETTE', paletteId: 3, paletteName: 'Old' })).toBe('Old')
  })
})

describe('includedTargetKey', () => {
  it('gives the three states three distinct keys', () => {
    // This feeds UpdateDialog's once-per-run guard. Two states sharing a key leaves the dialog
    // showing a stale frame — the Mode B case previously rendered no checklist behind a
    // permanently disabled button.
    const keys = [includedTargetKey(null), includedTargetKey(CUE), includedTargetKey(LOOK)]
    expect(new Set(keys).size).toBe(3)
  })

  it("doesn't collide a cue and a look that share an id", () => {
    // The ids come from different tables, so sharing a number is normal rather than a corner case.
    expect(includedTargetKey({ kind: 'CUE', cueId: 3 })).not.toBe(
      includedTargetKey({ kind: 'LOOK', lookId: 3 }),
    )
  })
})

describe('includedTargetIsReadOnly', () => {
  it('marks a look target as one Update cannot write back to', () => {
    // Update still writes through the retired palette tables, so offering it for a Look would
    // report success and write rows no consumer reads.
    expect(includedTargetIsReadOnly(LOOK)).toBe(true)
  })

  it('leaves a cue target writable', () => {
    expect(includedTargetIsReadOnly(CUE)).toBe(false)
    expect(includedTargetIsReadOnly(null)).toBe(false)
  })
})

describe('includedCueId', () => {
  it('narrows to the cue arm only', () => {
    expect(includedCueId(CUE)).toBe(4)
    expect(includedCueId(LOOK)).toBeNull()
    expect(includedCueId(null)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { describeIncludedTarget, includedCueId, includedTargetKey } from './includedTarget'
import type { IncludedTarget } from '@/api/programmerWsApi'

const CUE: IncludedTarget = { kind: 'CUE', cueId: 4, cueNumber: '2.1', cueName: 'Warm wash' }
const PALETTE: IncludedTarget = {
  kind: 'PALETTE',
  paletteId: 7,
  paletteName: 'Warm Amber',
  paletteType: 'COLOUR',
}

describe('describeIncludedTarget', () => {
  it('names a cue by number and name', () => {
    expect(describeIncludedTarget(CUE)).toBe('2.1 · Warm wash')
  })

  it('names a palette, and says which kind of palette it is', () => {
    // The toolbar tooltip reads "Write your changes back into …", and "Warm Amber" alone would
    // not tell an operator whether they are about to overwrite a cue or a palette.
    expect(describeIncludedTarget(PALETTE)).toBe('Warm Amber (colour palette)')
  })

  it('falls back to the id when the server sent no name', () => {
    expect(describeIncludedTarget({ kind: 'CUE', cueId: 9 })).toBe('Cue 9')
    expect(describeIncludedTarget({ kind: 'PALETTE', paletteId: 9 })).toBe('Palette 9')
  })
})

describe('includedTargetKey', () => {
  it('gives the three states three distinct keys', () => {
    // This feeds UpdateDialog's once-per-run guard. Two states sharing a key leaves the dialog
    // showing a stale frame — the Mode B case previously rendered no checklist behind a
    // permanently disabled button.
    const keys = [includedTargetKey(null), includedTargetKey(CUE), includedTargetKey(PALETTE)]
    expect(new Set(keys).size).toBe(3)
  })

  it("doesn't collide a cue and a palette that share an id", () => {
    expect(includedTargetKey({ kind: 'CUE', cueId: 3 })).not.toBe(
      includedTargetKey({ kind: 'PALETTE', paletteId: 3 }),
    )
  })
})

describe('includedCueId', () => {
  it('narrows to the cue arm only', () => {
    expect(includedCueId(CUE)).toBe(4)
    expect(includedCueId(PALETTE)).toBeNull()
    expect(includedCueId(null)).toBeNull()
  })
})

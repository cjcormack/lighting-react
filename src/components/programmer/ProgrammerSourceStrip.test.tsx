// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IncludedTarget } from '@/api/programmerWsApi'

let summary = { blind: false, entryCount: 0, lastIncluded: null as IncludedTarget | null }
let dirty: number | null = null
let stacks: unknown[] = []

vi.mock('@/store/programmer', () => ({
  useProgrammerSummaryQuery: () => ({ data: summary }),
}))
vi.mock('@/store/fixtureFx', () => ({ useActiveEffectsQuery: () => ({ data: [] }) }))
vi.mock('@/store/cueStacks', () => ({ useProjectCueStackListQuery: () => ({ data: stacks }) }))
vi.mock('@/store/looks', () => ({ useLookListQuery: () => ({ data: [] }) }))
vi.mock('./useIncludeBaseline', () => ({ useIncludeBaseline: () => dirty }))

import { ProgrammerSourceStrip } from './ProgrammerSourceStrip'

const CUE: IncludedTarget = {
  kind: 'CUE',
  cueId: 5,
  cueStackId: 2,
  cueNumber: 'Q4',
  cueName: 'Warm Wash',
}
const STACK = { id: 2, name: 'Act 1', cues: [{ id: 5 }, { id: 6 }] }

function draw() {
  render(
    <ProgrammerSourceStrip
      projectId={1}
      onUpdate={() => {}}
      onRevert={() => {}}
      onRecord={() => {}}
    />,
  )
}

afterEach(() => {
  cleanup()
  summary = { blind: false, entryCount: 0, lastIncluded: null }
  dirty = null
  stacks = []
})

describe('ProgrammerSourceStrip', () => {
  it('says the programmer is empty rather than rendering nothing', () => {
    // Empty is a STATE, not an absence — "what am I editing?" must never need a hover, and
    // "nothing yet, Include something" is the answer to a real question.
    draw()
    expect(screen.getByText(/Programmer is empty/)).toBeTruthy()
    expect(screen.getByText('Include')).toBeTruthy()
  })

  it('offers Record when busking with no source', () => {
    summary = { ...summary, entryCount: 12 }
    draw()
    expect(screen.getByText(/No source — 12 values, nothing to update/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Record/ })).toBeTruthy()
  })

  it('names the cue, its stack and its position, and labels Update with it', () => {
    summary = { ...summary, entryCount: 9, lastIncluded: CUE }
    dirty = 3
    stacks = [STACK]
    draw()
    expect(screen.getByText('Q4')).toBeTruthy()
    expect(screen.getByText('Warm Wash')).toBeTruthy()
    expect(screen.getByText('Act 1 · cue 1 of 2')).toBeTruthy()
    expect(screen.getByText('3 changes not written back')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Update Q4' })).not.toBeDisabled()
  })

  it('disables Update and says "in sync" only when a baseline proves it', () => {
    summary = { ...summary, entryCount: 9, lastIncluded: CUE }
    dirty = 0
    stacks = [STACK]
    draw()
    expect(screen.getByText('in sync')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Update Q4' })).toBeDisabled()
  })

  it('NEVER claims "in sync" without a baseline, and leaves Update enabled', () => {
    // The rule of this band. A reloaded tab, or one opened after the Include, has no baseline. A
    // false "in sync" tells an operator their work is written when it is not, and costs the cue —
    // so the badge is omitted entirely and Update stays pressable.
    summary = { ...summary, entryCount: 9, lastIncluded: CUE }
    dirty = null
    stacks = [STACK]
    draw()
    expect(screen.queryByText('in sync')).toBeNull()
    expect(screen.queryByText(/not written back/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Update Q4' })).not.toBeDisabled()
  })

  it('reports a deleted cue instead of a conflict it cannot detect', () => {
    // "Q4 changed on another desk" is not reachable — no version on `Cue`, no frame announcing it.
    // A cue that has left the stack list IS, and it reuses the same amber slot.
    summary = { ...summary, entryCount: 9, lastIncluded: CUE }
    stacks = []
    draw()
    expect(screen.getByText(/has been deleted/)).toBeTruthy()
  })
})

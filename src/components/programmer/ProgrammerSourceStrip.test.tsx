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
    // The sentence is assembled from spans now (see the drop-order test below), so it is matched
    // on the label's `title` — the copy that has to stay whole at every width.
    expect(screen.getByTitle('No source — 12 values, nothing to update')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Record/ })).toBeTruthy()
  })

  it('drops the busking count as a whole part rather than ellipsing the sentence', () => {
    // `PD-SOURCE-TRUNCATION`. The rule is that every rung is still a true sentence, so the count
    // has to be its own element — a `truncate` on one string can only slice it mid-word. This
    // asserts both halves: that the part is separable, and that what is left reads correctly.
    summary = { ...summary, entryCount: 12 }
    draw()
    const sentence = screen.getByText(/No source/)
    const text = sentence.textContent ?? ''
    expect(text).toBe('No source — 12 values, nothing to update')
    const part = (content: string) =>
      [...sentence.querySelectorAll('span')].find((el) => el.textContent === content)
    expect(part('12 values, ')?.className).toContain('@[260px]:inline')
    // Every rung, in the order they drop. The dash goes WITH the clause, not after it: dropping
    // the clause alone would leave a dangling `No source — `, which is the bare-punctuation trap
    // the empty arm's full stop avoids from the other side.
    expect(text.replace('12 values, ', '')).toBe('No source — nothing to update')
    expect(part(' — 12 values, nothing to update')?.className).toContain('@[200px]:inline')
    expect(sentence.firstChild?.textContent).toBe('No source')
  })

  it('never leaves the busking box rendering nothing at all', () => {
    // The floor, and the reason it is not just `Busking` said twice: row A crosses its own
    // `@[600px]` gate at about the width where this box is 120-195px, so without a rung below
    // 200px the box switches on already under it — a bordered strip showing ~195px of nothing
    // between the label and Record. A dead gap is a different fault from a redundant word.
    summary = { ...summary, entryCount: 12 }
    draw()
    const floor = screen.getByText(/No source/)
    expect(floor.className).toContain('@[80px]:inline')
    expect(floor.firstChild?.textContent).toBe('No source')
  })

  it("drops the empty state's parts whole, and never leaves a bare full stop", () => {
    // Same rule, three rungs, and the punctuation is the trap twice over: the stop is drawn
    // outside the clauses that drop, and `Include` is INSIDE the droppable group so the shortest
    // rung is `Programmer is empty.` rather than `Programmer is empty. .`
    draw()
    const sentence = screen.getByText(/Programmer is empty/)
    const text = sentence.textContent ?? ''
    expect(text).toBe('Programmer is empty. Include a cue or a Look, or start busking.')
    const part = (content: string) =>
      [...sentence.querySelectorAll('span')].find((el) => el.textContent === content)
    expect(part(', or start busking')?.className).toContain('@[380px]:inline')
    expect(part(' a cue or a Look')?.className).toContain('@[280px]:inline')
    // Every rung, in the order they drop.
    expect(text.replace(', or start busking', '')).toBe(
      'Programmer is empty. Include a cue or a Look.',
    )
    expect(text.replace(' a cue or a Look, or start busking', '')).toBe(
      'Programmer is empty. Include.',
    )
    expect(sentence.firstChild?.textContent).toBe('Programmer is empty.')
  })

  it('measures the sentence against its own box, not the row the box shares', () => {
    // The defect the desk pass found and a threshold change could not have fixed: row A holds
    // this strip beside the action bar and the two split it about 50/50, so an `@[Npx]` resolved
    // against row A is asking about twice the width the sentence has. `SentenceBox` is the
    // container, and `flex-1 min-w-0` is what gives it a size at all — under `inline-size`
    // containment an auto-width flex item collapses to zero and every rung would vanish.
    draw()
    const sentence = screen.getByText(/Programmer is empty/)
    let box: HTMLElement | null = sentence
    while (box && !box.className.includes('@container')) box = box.parentElement
    expect(box?.className).toContain('flex-1')
    expect(box?.className).toContain('min-w-0')
    // The hover lives on the box, not on the text: below the floor the text is gone, and a title
    // on a hidden span is no title at all. This arm has no label to carry it the way busking does.
    expect(box?.getAttribute('title')).toBe(
      'Programmer is empty. Include a cue or a Look, or start busking.',
    )
  })

  it('never leaves the empty box rendering a sliced word either', () => {
    // The fourth review round's find: busking got an engineered floor and this arm did not, so
    // `Programmer is empty.` (~124px) was drawn into a box measured at 117px on an 852×393 phone
    // and 64px in portrait — `Programmer is em…`. Both arms now have a floor.
    draw()
    const floor = screen.getByText(/Programmer is empty/)
    expect(floor.className).toContain('@[140px]:inline')
    expect(floor.firstChild?.textContent).toBe('Programmer is empty.')
  })

  it('names the cue, its stack and its position, and labels Update with it', () => {
    summary = { ...summary, entryCount: 9, lastIncluded: CUE }
    dirty = 3
    stacks = [STACK]
    draw()
    // Two `Q4`s on screen since session 1: the cue number in the box, and the one appended to
    // Update at `@[800px]`. Both are the same fact, so the assertion is that at least one is there.
    expect(screen.getAllByText('Q4').length).toBeGreaterThan(0)
    expect(screen.getByText('Warm Wash')).toBeTruthy()
    expect(screen.getByText('Act 1 · cue 1 of 2')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Update Q4' })).not.toBeDisabled()
  })

  it('carries every sentence a narrow width hides on a title or an aria-label', () => {
    // The promise of session 1: rows A and B lost their labels and their explanatory sentences to
    // gain the page back, and *nothing they said was deleted*. Each one is on hover instead, so
    // these assertions are what stops a later shrink quietly taking the words with it.
    summary = { ...summary, entryCount: 9, lastIncluded: CUE }
    dirty = 3
    stacks = [STACK]
    draw()
    // The long dirty wording — visible only at `@[1100px]`.
    expect(screen.getByTitle('3 changes not written back')).toBeTruthy()
    // Revert is an icon below `@[1100px]`; the word is its accessible name at every width.
    expect(screen.getByRole('button', { name: 'Revert' })).toBeTruthy()
    // The whole state as one sentence, for the widths where the location line is gone — on the
    // *text*, never on the box: a native `title` on an ancestor is what the browser shows for a
    // descendant that has none, and the Update button below is already inside a Radix tooltip.
    const sentence = screen.getAllByTitle('Editing · Q4 · Warm Wash · Act 1 · cue 1 of 2')
    expect(sentence.length).toBeGreaterThan(0)
    for (const el of sentence) expect(el.querySelector('button')).toBeNull()
  })

  it('keeps the cue number on Update\'s accessible name when the visible text drops it', () => {
    // Below `@[800px]` the button reads just "Update". Which cue it writes to is the one thing an
    // operator must not have to guess, so it stays on the label rather than only in the box.
    summary = { ...summary, entryCount: 9, lastIncluded: CUE }
    dirty = 2
    stacks = [STACK]
    draw()
    expect(screen.getByRole('button', { name: 'Update Q4' })).toBeTruthy()
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

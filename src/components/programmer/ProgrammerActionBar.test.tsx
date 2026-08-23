// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IncludedTarget } from '@/api/programmerWsApi'

let summary = { blind: false, entryCount: 0, lastIncluded: null as IncludedTarget | null }
let effects: { programmerOwned: boolean }[] = []

const programmerClearAll = vi.fn()
const programmerSetBlind = vi.fn()
vi.mock('@/store/programmer', () => ({
  useProgrammerSummaryQuery: () => ({ data: summary }),
  programmerClearAll: (...a: unknown[]) => programmerClearAll(...a),
  programmerSetBlind: (...a: unknown[]) => programmerSetBlind(...a),
}))
vi.mock('@/store/fixtureFx', () => ({ useActiveEffectsQuery: () => ({ data: effects }) }))
vi.mock('@/store/cueStacks', () => ({
  useProjectCueStackListQuery: () => ({ data: [{ id: 2, name: 'Act 1', cues: [] }] }),
}))

const sheets = {
  openRecord: vi.fn(),
  openRecordLook: vi.fn(),
  openInclude: vi.fn(),
  openUpdate: vi.fn(),
}
vi.mock('./ProgrammerSheets', () => ({ useProgrammerSheets: () => sheets }))

import { ProgrammerActionBar } from './ProgrammerActionBar'

/**
 * Radix's DropdownMenuTrigger opens on `pointerdown`, not `click` — so `fireEvent.click` alone
 * leaves the menu shut and every assertion below it fails for the wrong reason.
 */
function openRecordMenu() {
  fireEvent.pointerDown(
    screen.getByRole('button', { name: 'Record destination' }),
    { button: 0, ctrlKey: false, pointerType: 'mouse' },
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.localStorage.clear()
  summary = { blind: false, entryCount: 0, lastIncluded: null }
  effects = []
})

const CUE: IncludedTarget = {
  kind: 'CUE',
  cueId: 5,
  cueStackId: 2,
  cueNumber: 'Q4',
  cueName: 'Warm Wash',
}

describe('ProgrammerActionBar', () => {
  it('labels its three zones so staging and writing tell apart', () => {
    // Seven identical outline buttons in one row was the complaint; the labels are the fix.
    render(<ProgrammerActionBar projectId={1} />)
    expect(screen.getByText('Stage')).toBeTruthy()
    expect(screen.getByText('Load')).toBeTruthy()
    expect(screen.getByText('Save')).toBeTruthy()
  })

  it('keeps every control on the surface — no overflow kebab', () => {
    // The old bar hid Record / Record look / Include / Update behind a `MoreHorizontal` below `sm`,
    // which put the whole point of the programmer one tap further away on the surface most likely
    // to be used standing up.
    render(<ProgrammerActionBar projectId={1} />)
    expect(screen.getByText('Clear')).toBeTruthy()
    expect(screen.getByText('Blind')).toBeTruthy()
    expect(screen.getByText('Include…')).toBeTruthy()
    expect(screen.getByText('Record')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /more/i })).toBeNull()
  })

  it('has no Update — that moved to the source strip, beside what it writes to', () => {
    summary = { ...summary, entryCount: 4, lastIncluded: CUE }
    render(<ProgrammerActionBar projectId={1} />)
    expect(screen.queryByRole('button', { name: /^Update/ })).toBeNull()
  })

  it('enables Clear for a busked EFFECT with no value behind it', () => {
    // A busking pad creates a band FX with no entry. Gating on the entry count alone would disable
    // the escape hatch in exactly the case an operator most needs it.
    effects = [{ programmerOwned: true }]
    render(<ProgrammerActionBar projectId={1} />)
    const clear = screen.getByText('Clear').closest('button')!
    expect(clear).not.toBeDisabled()
    fireEvent.click(clear)
    expect(programmerClearAll).toHaveBeenCalled()
  })

  it('disables Clear only when there is neither a value nor an effect', () => {
    render(<ProgrammerActionBar projectId={1} />)
    expect(screen.getByText('Clear').closest('button')).toBeDisabled()
  })

  it('leaves Include enabled on an empty programmer — it is how you fill it', () => {
    render(<ProgrammerActionBar projectId={1} />)
    const include = screen.getByText('Include…').closest('button')!
    expect(include).not.toBeDisabled()
    fireEvent.click(include)
    expect(sheets.openInclude).toHaveBeenCalled()
  })

  it('offers Record four destinations, with the included cue among them', () => {
    // "Record look" stops being a sibling button and becomes one destination of one act.
    summary = { ...summary, entryCount: 12, lastIncluded: CUE }
    render(<ProgrammerActionBar projectId={1} />)

    openRecordMenu()
    expect(screen.getByText('Write 12 values into')).toBeTruthy()
    expect(screen.getByText('Q4 Warm Wash')).toBeTruthy()
    expect(screen.getByText('A new cue after Q4')).toBeTruthy()
    expect(screen.getByText('A new Look')).toBeTruthy()
    expect(screen.getByText('An existing cue…')).toBeTruthy()
    // NOT a predicted "becomes Q4.5" — the server assigns the number.
    expect(screen.queryByText(/Q4\.5/)).toBeNull()
  })

  it('omits the update-this-cue destination when nothing is included', () => {
    summary = { ...summary, entryCount: 3 }
    render(<ProgrammerActionBar projectId={1} />)
    openRecordMenu()
    expect(screen.queryByText('Update the cue you are editing')).toBeNull()
    expect(screen.getByText('A new Look')).toBeTruthy()
  })

  it('toggles blind with the current fade', () => {
    render(<ProgrammerActionBar projectId={1} />)
    fireEvent.click(screen.getByText('Blind').closest('button')!)
    expect(programmerSetBlind).toHaveBeenCalledWith(true, 0)
  })
})

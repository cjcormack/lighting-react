// @vitest-environment jsdom
import { DndContext } from '@dnd-kit/core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GroupSummary } from '@/api/groupsApi'
import type { DeskSelectionSnapshot } from '@/api/selectionApi'
import type { BuskRig, BuskRigPatch, BuskRigTile } from '@/api/buskRigApi'
import type { AttributeFamily } from '@/lib/attributeFamily'
import { resetDeskFollowStores } from '@/lib/deskFollow'
import { getBuskFocus, resetBuskWindowStores, setBuskFocus, setBuskRigRows } from '@/lib/buskWindow'
import type { Fixture } from '@/store/fixtures'
import type { FixtureAppearance } from '@/components/fixtures/fixtureAppearance'
import { buskingTargetKey, type BuskingTarget } from './buskingTypes'

/**
 * The rig band (busk-further plan session 3), over `TargetBand.test.tsx`'s ground.
 *
 * The first test is the migration: an empty rig draws what the target band drew — every group then
 * every fixture, groups badged. The rest are the band's own: a built rig draws its rows; the three
 * cell modes expand; a tile press toggles the whole fixture (and a cell tile its cell) through the
 * one `{type, key}` shape; the rows handle clamps; the two verbs that belong to later sessions are
 * drawn inert; and below `md` the band is one row with a row chip.
 */

let groups: GroupSummary[] = []
let fixtures: Fixture[] = []
let patches: { id: number; key: string; displayName: string; stageHidden: boolean; groups: { id: number; name: string }[] }[] = []
let rigData: BuskRig | undefined = { rows: [] }
const commit = vi.fn()

vi.mock('@/store/groups', () => ({ useGroupListQuery: () => ({ data: groups }) }))
vi.mock('@/store/fixtures', () => ({
  useFixtureListQuery: () => ({ data: fixtures }),
  useFixtureTypeListQuery: () => ({ data: [] }),
}))
vi.mock('@/store/patches', () => ({ usePatchListQuery: () => ({ data: patches }) }))
vi.mock('@/store/busk', () => ({
  useBuskRigQuery: () => ({ data: rigData, isError: false }),
  useBuskRigCommit: () => commit,
}))
vi.mock('@/store/locate', () => ({
  useLocateStateQuery: () => ({ data: { targets: [] } }),
  useToggleLocateMutation: () => [vi.fn(() => ({ unwrap: () => Promise.resolve() }))],
}))
vi.mock('@/components/fixtures-list/useHighlight', () => ({
  useHighlight: () => ({ press: vi.fn(), release: vi.fn(), isActive: false }),
}))
vi.mock('@/store/hand', () => ({
  useHandPlace: () => vi.fn(),
  useDeskHandQuery: () => ({ offer: null }),
  heldName: () => 'held',
}))
// The stage's colour dispatch, frozen: red at full, with four per-cell segments.
vi.mock('@/components/fixtures/fixtureAppearance', () => ({
  FixtureAppearanceSource: ({ children }: { children: (a: FixtureAppearance) => React.ReactNode }) =>
    children({
      color: '#ff0000',
      intensity: 1,
      segments: [0, 1, 2, 3].map((i) => ({ css: `#00000${i}`, intensity: 0.5 })),
    }),
}))
// The desk chip's readers (the same three `TargetBand.test.tsx` mocked).
let snapshot: DeskSelectionSnapshot = { targets: [], families: null, source: null }
vi.mock('@/store/selection', () => ({ useDeskSelectionSnapshot: () => snapshot }))
vi.mock('@/lib/windowIdentity', () => ({ useWindowName: () => 'Screen 2' }))
vi.mock('@/store/windows', () => ({ useDeskWindows: () => [], thisWindowRow: () => null }))

import { RigBand } from './RigBand'
import { RigStrip } from './RigStrip'

function group(name: string, memberCount: number): GroupSummary {
  return { name, memberCount, capabilities: [], symmetricMode: 'NONE', defaultDistribution: 'NONE', compatibleLookIds: [] }
}

const barCells = [0, 1, 2, 3].map((i) => ({ index: i, key: `bar-1.pixel-${i}`, displayName: `Cell ${i + 1}`, properties: [] }))
const barFixture = { key: 'bar-1', name: 'Bar L', typeKey: 'bar', elements: barCells, groups: [] } as unknown as Fixture
const parFixture = { key: 'par-1', name: 'PAR 1', typeKey: 'par', groups: [] } as unknown as Fixture
const barPatch: BuskRigPatch = { id: 11, key: 'bar-1', name: 'Bar L', elements: barCells.map((c) => ({ key: c.key, name: c.displayName })) }
const parPatch: BuskRigPatch = { id: 12, key: 'par-1', name: 'PAR 1' }

let nextId = 1
function tile(overrides: Partial<BuskRigTile> & Pick<BuskRigTile, 'kind'>): BuskRigTile {
  const id = nextId++
  return { id, uuid: `t${id}`, cellMode: 'PIPS', ...overrides }
}
function builtRig(): BuskRig {
  return {
    rows: [
      { id: 1, uuid: 'r1', name: 'Wash', tiles: [tile({ kind: 'GROUP', group: group('Front wash', 6) }), tile({ kind: 'FIXTURE', patch: barPatch })] },
      {
        id: 2,
        uuid: 'r2',
        name: 'Cells',
        tiles: [
          tile({ kind: 'FIXTURE', patch: barPatch, cellMode: 'PER_CELL' }),
          tile({ kind: 'FIXTURE', patch: barPatch, cellMode: 'HALVES', cellSplit: 2 }),
          tile({ kind: 'FIXTURE', patch: barPatch, elementKey: 'bar-1.pixel-2', cellMode: 'WHOLE' }),
        ],
      },
      { id: 3, uuid: 'r3', name: 'Three', tiles: [tile({ kind: 'FIXTURE', patch: parPatch })] },
      { id: 4, uuid: 'r4', name: 'Four', tiles: [tile({ kind: 'FIXTURE', patch: parPatch })] },
    ],
  }
}

function draw(
  selected: BuskingTarget[] = [],
  handlers: Partial<Parameters<typeof RigBand>[0]> = {},
  families: AttributeFamily[] | null = null,
) {
  const map = new Map(selected.map((t) => [buskingTargetKey(t), t]))
  return render(
    <DndContext>
      <RigBand
        projectId={1}
        selectedTargets={map}
        families={families}
        onToggle={handlers.onToggle ?? (() => {})}
        onClear={handlers.onClear ?? (() => {})}
        editing={handlers.editing ?? false}
        compact={handlers.compact ?? false}
        focus={handlers.focus ?? 'split'}
      />
    </DndContext>,
  )
}

const tileButtons = () =>
  screen.getAllByRole('button', { pressed: false }).concat(screen.queryAllByRole('button', { pressed: true }))
    .filter((b) => b.getAttribute('aria-pressed') != null && !b.textContent?.startsWith('Targets') && !b.textContent?.startsWith('Cells'))

beforeEach(() => {
  // A desk screen: wide, tall, so the split defaults to three rows (`lib/buskWindow.ts`'s ladder).
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.startsWith('(min-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }))
  snapshot = { targets: [], families: null, source: null }
  groups = [group('Front wash', 6)]
  fixtures = [barFixture, parFixture]
  patches = [
    { id: 11, key: 'bar-1', displayName: 'Bar L', stageHidden: false, groups: [{ id: 1, name: 'Front wash' }] },
    { id: 12, key: 'par-1', displayName: 'PAR 1', stageHidden: false, groups: [] },
  ]
  rigData = { rows: [] }
  commit.mockClear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.sessionStorage.clear()
  resetDeskFollowStores()
  resetBuskWindowStores()
  vi.unstubAllGlobals()
})

describe('the rig band', () => {
  it('draws an empty rig as today’s band: every group then every fixture, groups badged', () => {
    draw()
    expect(screen.getByText('Groups')).toBeInTheDocument()
    expect(screen.getByText('Fixtures')).toBeInTheDocument()
    const names = tileButtons().map((b) => b.textContent)
    expect(names).toEqual(['Front wash6', 'Bar L4', 'PAR 1'])
  })

  it('explains an empty rig rather than drawing an empty band', () => {
    groups = []
    fixtures = []
    draw()
    expect(screen.getByText('No fixtures or groups configured')).toBeInTheDocument()
  })

  it('draws a built rig as its rows, and never the fallback beside them', () => {
    rigData = builtRig()
    draw()
    expect(screen.getByText('Wash')).toBeInTheDocument()
    expect(screen.getByText('Cells')).toBeInTheDocument()
    expect(screen.queryByText('Groups')).not.toBeInTheDocument()
    expect(screen.queryByText('Fixtures')).not.toBeInTheDocument()
  })

  it('expands a PER_CELL tile per cell, a HALVES tile into runs, and a cell tile into its cell', () => {
    rigData = builtRig()
    draw()
    for (let i = 1; i <= 4; i += 1) expect(screen.getAllByText(`Bar L · Cell ${i}`).length).toBeGreaterThan(0)
    expect(screen.getByText('Bar L 1–2')).toBeInTheDocument()
    expect(screen.getByText('Bar L 3–4')).toBeInTheDocument()
    // The cell tile and the PER_CELL expansion both name cell 3 — two tiles, one cell.
    expect(screen.getAllByText('Bar L · Cell 3')).toHaveLength(2)
  })

  it('toggles the whole fixture on a tile press, and a cell on a cell tile — as `{type, key}`', () => {
    rigData = builtRig()
    const onToggle = vi.fn()
    draw([], { onToggle })
    fireEvent.click(screen.getByRole('button', { name: 'Bar L' }))
    expect(onToggle).toHaveBeenLastCalledWith({ type: 'fixture', key: 'bar-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Front wash' }))
    expect(onToggle).toHaveBeenLastCalledWith({ type: 'group', key: 'Front wash' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Bar L · Cell 3' })[0])
    expect(onToggle).toHaveBeenLastCalledWith({ type: 'fixture', key: 'bar-1.pixel-2' })
    onToggle.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Bar L 3–4' }))
    expect(onToggle.mock.calls.map((c) => c[0])).toEqual([
      { type: 'fixture', key: 'bar-1.pixel-2' },
      { type: 'fixture', key: 'bar-1.pixel-3' },
    ])
  })

  it('presses a run as one pad: on from anything but all, off from all', () => {
    rigData = builtRig()
    const onToggle = vi.fn()
    // Cell 3 (pixel-2) is already selected, so the run 3–4 is half lit.
    draw([{ type: 'fixture', key: 'bar-1.pixel-2', fixture: barFixture, element: barCells[2] }], { onToggle })
    const run = screen.getByRole('button', { name: 'Bar L 3–4' })
    expect(run).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(run)
    // Only the unlit cell is toggled — on — so the run reaches `all` rather than its complement.
    expect(onToggle.mock.calls.map((c) => c[0])).toEqual([{ type: 'fixture', key: 'bar-1.pixel-3' }])
  })

  it('reads a cell or run tile `all` while its whole fixture is selected — a parent covers its cells', () => {
    rigData = builtRig()
    draw([{ type: 'fixture', key: 'bar-1', fixture: barFixture }])
    expect(screen.getByRole('button', { name: 'Bar L 1–2' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('button', { name: 'Bar L · Cell 3' })[0]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'PAR 1' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reads a fixture tile `some` with a count when one of its cells is selected elsewhere', () => {
    rigData = builtRig()
    draw([{ type: 'fixture', key: 'bar-1.pixel-1', fixture: barFixture, element: barCells[1] }])
    const bar = screen.getByRole('button', { name: 'Bar L' })
    expect(bar).toHaveAttribute('aria-pressed', 'true')
    expect(within(bar).getByText('1 of 4')).toBeInTheDocument()
    expect(screen.getByText('Bar L · Cell 2 · 1 head')).toBeInTheDocument()
  })

  it('draws the live bar and read-only pips through the stage’s colour dispatch', () => {
    rigData = builtRig()
    draw()
    const bar = screen.getByRole('button', { name: 'Bar L' })
    const pips = bar.querySelector('[data-rig-pips]')!
    expect(pips.children).toHaveLength(4)
    expect((pips.children[2] as HTMLElement).style.background).toBe('rgb(0, 0, 2)')
  })

  it('summarises the selection in heads, and clears through the handler', () => {
    const onClear = vi.fn()
    draw([{ type: 'group', name: 'Front wash', group: groups[0] }, { type: 'fixture', key: 'par-1', fixture: parFixture }], { onClear })
    expect(screen.getByText('Front wash, PAR 1 · 7 heads')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('wraps the label row rather than overflowing the band at a tablet width', () => {
    draw()
    const row = document.querySelector('[data-rig-label-row]')!
    expect(row.className).toContain('flex-wrap')
    expect(screen.getByText('nothing selected').className).toContain('min-w-[8rem]')
  })

  it('draws Cells and Spread… inert, and the family pill', () => {
    draw([{ type: 'group', name: 'Front wash', group: groups[0] }], {}, ['COLOUR'])
    expect(screen.getByRole('button', { name: 'Cells: All' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Spread…' })).toBeDisabled()
    expect(screen.getByText('Colour')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Targets: Desk' })).toBeInTheDocument()
  })

  it('clamps the rows handle to 1…N, and the handle writes the window’s fact', () => {
    rigData = builtRig()
    setBuskRigRows(3)
    draw()
    expect(screen.getByText('3 of 4 rows')).toBeInTheDocument()
    expect(screen.queryByText('Four')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show one row more' }))
    expect(screen.getByText('4 of 4 rows')).toBeInTheDocument()
    expect(screen.getByText('Four')).toBeInTheDocument()
    expect(window.sessionStorage.getItem('busk.rigRows')).toBe('4')
    const fewer = screen.getByRole('button', { name: 'Show one row fewer' })
    fireEvent.click(fewer)
    fireEvent.click(fewer)
    fireEvent.click(fewer)
    expect(screen.getByText('1 of 4 rows')).toBeInTheDocument()
    expect(window.sessionStorage.getItem('busk.rigRows')).toBe('1')
    expect(screen.queryByText('Cells')).not.toBeInTheDocument()
  })

  it('snaps past the ends of the handle into Rig and Pads focus (D6)', () => {
    rigData = builtRig()
    setBuskRigRows(4)
    draw()
    expect(screen.getByText('4 of 4 rows')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show one row more' }))
    expect(getBuskFocus()).toBe('rig')
    // The wish is untouched: back in Split the band shows the same four rows.
    expect(window.sessionStorage.getItem('busk.rigRows')).toBe('4')

    setBuskFocus('split')
    setBuskRigRows(1)
    cleanup()
    draw()
    expect(screen.getByText('1 of 4 rows')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show one row fewer' }))
    expect(getBuskFocus()).toBe('pads')
  })

  it('shows every row with no handle in Rig focus, filling the body — below md too', () => {
    rigData = builtRig()
    setBuskRigRows(1)
    draw([], { focus: 'rig' })
    expect(screen.getByText('Four')).toBeInTheDocument()
    expect(screen.queryByText(/of 4 rows/)).not.toBeInTheDocument()
    expect(document.querySelector('[data-rig-band="rig"]')!.className).toContain('flex-1')

    cleanup()
    draw([], { focus: 'rig', compact: true })
    expect(screen.getByText('Four')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Row:/ })).not.toBeInTheDocument()
  })

  it('is one row with a row chip below md, the verbs in a menu', () => {
    rigData = builtRig()
    draw([], { compact: true })
    expect(screen.getByRole('button', { name: 'Row: Wash' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Front wash' })).toBeInTheDocument()
    expect(screen.queryByText('Cells')).not.toBeInTheDocument()
    expect(screen.queryByText('Bar L 1–2')).not.toBeInTheDocument()
    expect(screen.queryByText(/of 4 rows/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Selection verbs' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Locate' })).not.toBeInTheDocument()
  })

  describe('in Edit layout', () => {
    it('offers a name field, a cross per tile and a cell-mode menu on a multi-head tile', () => {
      rigData = builtRig()
      draw([], { editing: true })
      expect(screen.getAllByLabelText('Row name')).toHaveLength(4)
      expect(screen.getByLabelText('Remove Front wash from the rig')).toBeInTheDocument()
      expect(screen.getByLabelText('Cell mode for Bar L')).toBeInTheDocument()
      expect(screen.queryByLabelText('Cell mode for PAR 1')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Show every target' })).toBeEnabled()
      // The play verbs step aside while editing: tiles are drag handles, not toggles.
      expect(screen.queryByRole('button', { name: 'Cells: All' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
    })

    it('registers every drawn cell of one stored tile under its own drag id', () => {
      rigData = builtRig()
      draw([], { editing: true })
      // dnd-kit stamps `aria-describedby="DndDescribedBy-<n>"` per draggable; the four PER_CELL
      // cells, the two runs and the cell tile must be seven registrations, not one shared id.
      const cells = screen.getAllByRole('button', { name: /^Bar L · Cell \d$/ })
      const runs = screen.getAllByRole('button', { name: /^Bar L \d–\d$/ })
      const ids = new Set([...cells, ...runs].map((b) => b.closest('[data-rig-tile-id]')?.getAttribute('data-rig-tile-id')))
      expect(ids.size).toBe(cells.length + runs.length)
    })

    it('commits a tile removal as an op over the rig', () => {
      rigData = builtRig()
      draw([], { editing: true })
      fireEvent.click(screen.getByLabelText('Remove Front wash from the rig'))
      expect(commit).toHaveBeenCalledTimes(1)
      const op = commit.mock.calls[0][0] as (rig: BuskRig) => BuskRig
      const next = op(builtRig())
      expect(next.rows![0].tiles!.map((t) => t.group?.name ?? t.patch?.name)).toEqual(['Bar L'])
    })

    it('draws the fallback dimmed with nothing to move, and only the new-row zone to drop on', () => {
      draw([], { editing: true })
      expect(screen.getByText(/Showing every target/)).toBeInTheDocument()
      expect(screen.queryAllByLabelText('Row name')).toHaveLength(0)
      expect(screen.queryByLabelText(/Remove .* from the rig/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Show every target' })).toBeDisabled()
      expect(document.querySelector('[data-rig-new-row]')).not.toBeNull()
    })
  })
})

describe('the folded rig strip', () => {
  it('keeps the summary, the pill and the desk chip, and unfolds on its chevron', () => {
    const onUnfold = vi.fn()
    const map = new Map<string, BuskingTarget>([
      ['group:Front wash', { type: 'group', name: 'Front wash', group: group('Front wash', 6) }],
    ])
    render(<RigStrip selectedTargets={map} families={['COLOUR']} onUnfold={onUnfold} />)
    expect(screen.getByText('Front wash · 6 heads')).toBeInTheDocument()
    expect(screen.getByText('Colour')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Targets: Desk' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Unfold the rig' }))
    expect(onUnfold).toHaveBeenCalledTimes(1)
  })
})

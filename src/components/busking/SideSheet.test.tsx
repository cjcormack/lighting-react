// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { LIVE_SHEET_TABS, getBuskSheet, resetBuskWindowStores, setBuskSheet } from '@/lib/buskWindow'
import { resetCellEditorSurfaceMedia } from '@/components/sheet/cells/CellEditorSurface'
import { SIDE_PANEL_BODY_CLASS, SIDE_PANEL_STRIP_CLASS } from '@/components/sheet/sidePanel'
import { CHROME_ROW_CLASS } from '@/components/sheet/sheetFrame'
import type { BuskingTarget } from './buskingTypes'

/**
 * The side sheet (busk-further plan D7): three live tabs — Speed, Colour (session 5) and Spread
 * (session 6) — and the fold; the fold keeps the beat, master 1's tempo, the tab glyphs and the
 * selection's colour; off the desk board the sheet is an overlay carrying Colour and Spread and no
 * Speed tab. The sheet is one fact — `busk.sheet`, `none` for the fold — and the Colour tab's
 * *Spread to a second colour…* button opens Spread with *From* set through the host's seed.
 */

vi.mock('./BuskSpeedRail', () => ({ BuskSpeedRail: () => <div data-testid="speed-rail" /> }))
vi.mock('./ColourSheet', () => ({
  ColourSheet: ({ compact, onSpread }: { compact?: boolean; onSpread?: (from: { r: number; g: number; b: number }) => void }) => (
    <div data-testid="colour-sheet" data-compact={compact ? 'true' : 'false'}>
      <button type="button" onClick={() => onSpread?.({ r: 245, g: 179, b: 66 })}>Second colour</button>
    </div>
  ),
}))
vi.mock('./SpreadSheet', () => ({
  SpreadSheet: ({ compact, seed, onSeedConsumed }: { compact?: boolean; seed?: { from: { r: number; g: number; b: number }; key: number } | null; onSeedConsumed?: () => void }) => (
    <div data-testid="spread-sheet" data-compact={compact ? 'true' : 'false'} data-seed={seed == null ? '' : JSON.stringify(seed.from)}>
      <button type="button" onClick={() => onSeedConsumed?.()}>consume</button>
    </div>
  ),
}))
vi.mock('@/components/BeatIndicator', () => ({
  BeatIndicator: ({ master }: { master?: { index: number } }) => <span data-testid="beat" data-master={master?.index} />,
}))
vi.mock('@/store/speedMasters', () => ({
  useSpeedMasterLiveQuery: () => ({ data: [{ uuid: 'm1', index: 1, name: 'Global', bpm: 120.04 }] }),
}))
vi.mock('@/store/patches', () => ({
  usePatchListQuery: () => ({ data: [{ id: 1, key: 'par-1', displayName: 'PAR 1' }] }),
}))
const par = { key: 'par-1', name: 'PAR 1', typeKey: 'par', groups: ['Front wash'] }
vi.mock('@/hooks/useFixtureLookup', () => ({
  useFixtureLookup: () => ({ fixtures: [par], fixtureByKey: new Map([['par-1', par]]), typeByKey: new Map() }),
}))
vi.mock('@/components/fixtures/fixtureAppearance', () => ({
  FixtureAppearanceSource: ({ children }: { children: (a: { color: string; intensity: number }) => React.ReactNode }) =>
    children({ color: '#ff0000', intensity: 1 }),
}))

import { SIDE_SHEET_TABS, SideSheet, SideSheetOverlay, sideSheetTabs } from './SideSheet'

function surface({ narrow = false, short = false } = {}) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width') ? narrow : query.includes('500px') ? short : query.startsWith('(min-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }))
}

const selection = new Map<string, BuskingTarget>([
  ['group:Front wash', { type: 'group', name: 'Front wash', group: { name: 'Front wash', memberCount: 6 } } as BuskingTarget],
  ['fixture:par-1', { type: 'fixture', key: 'par-1', fixture: par } as unknown as BuskingTarget],
])
const props = { projectId: 1, selectedTargets: selection, families: null }

beforeEach(() => surface())

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
  resetBuskWindowStores()
  resetCellEditorSurfaceMedia()
  vi.unstubAllGlobals()
})

describe('docked, on the desk board', () => {
  it('offers Speed, Colour and Spread', () => {
    setBuskSheet('speed')
    render(<SideSheet {...props} />)
    const tabs = within(screen.getByRole('tablist', { name: 'Side sheet' })).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Speed', 'Colour', 'Spread'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('speed-rail')).toBeInTheDocument()
    expect(sideSheetTabs('docked').map((t) => t.id)).toEqual(['speed', 'colour', 'spread'])
  })

  it('mounts the Spread tab in the panel when the fact names it', () => {
    setBuskSheet('spread')
    render(<SideSheet {...props} />)
    expect(screen.getByRole('tab', { name: 'Spread' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('spread-sheet')).toHaveAttribute('data-compact', 'false')
    expect(screen.getByTestId('spread-sheet')).toHaveAttribute('data-seed', '')
    expect(screen.queryByTestId('colour-sheet')).toBeNull()
  })

  it('opens Spread with From set from the Colour tab’s Second colour switch, and drops the seed once it is read', () => {
    setBuskSheet('colour')
    render(<SideSheet {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Second colour' }))
    expect(getBuskSheet()).toBe('spread')
    expect(screen.getByTestId('spread-sheet')).toHaveAttribute('data-seed', JSON.stringify({ r: 245, g: 179, b: 66 }))
    // Read once: the tab asks the host to drop it, so a later visit by another door is not re-seeded.
    fireEvent.click(screen.getByRole('button', { name: 'consume' }))
    expect(screen.getByTestId('spread-sheet')).toHaveAttribute('data-seed', '')
  })

  it('mounts the Colour tab in the panel, full layout, when the fact names it', () => {
    setBuskSheet('colour')
    render(<SideSheet {...props} />)
    expect(screen.getByRole('tab', { name: 'Colour' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('colour-sheet')).toHaveAttribute('data-compact', 'false')
    expect(screen.queryByTestId('speed-rail')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Speed' }))
    expect(getBuskSheet()).toBe('speed')
  })

  it('folds to the strip on the chevron, writing none — the sheet is one fact', () => {
    setBuskSheet('speed')
    render(<SideSheet {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fold the side sheet' }))
    expect(getBuskSheet()).toBe('none')
    expect(document.querySelector('[data-side-sheet="none"]')).not.toBeNull()
    expect(screen.queryByTestId('speed-rail')).toBeNull()
    expect(Object.keys(window.sessionStorage).some((k) => /open/i.test(k))).toBe(false)
  })

  it('keeps the beat, master 1’s tempo, a glyph per live tab, the selection’s colour and its head count on the fold', () => {
    setBuskSheet('none')
    render(<SideSheet {...props} />)
    expect(screen.getByTestId('beat')).toHaveAttribute('data-master', '1')
    expect(document.querySelector('[data-fold-tempo]')).toHaveTextContent('120')
    expect(document.querySelector('[data-fold-heads]')).toHaveTextContent('7')
    expect((document.querySelector('[data-fold-colour]') as HTMLElement).style.background).toBe('rgb(255, 0, 0)')
    // One glyph per live tab; a tap unfolds onto it.
    expect(screen.getByRole('button', { name: 'Open the Spread tab' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open the Colour tab' }))
    expect(getBuskSheet()).toBe('colour')
  })

  it('unfolds onto a tab from the chevron', () => {
    setBuskSheet('none')
    render(<SideSheet {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unfold the side sheet' }))
    expect(getBuskSheet()).toBe('speed')
  })

  it('unfolds onto the tab that was last open — the memory a MIDI toggle reads — not always onto Speed', () => {
    setBuskSheet('colour')
    setBuskSheet('none')
    render(<SideSheet {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unfold the side sheet' }))
    expect(getBuskSheet()).toBe('colour')
    expect(screen.getByTestId('colour-sheet')).toBeInTheDocument()
  })

  it('wears the programmer rail’s chrome: the shared body, header and strip, and the enter animation', () => {
    setBuskSheet('speed')
    const { rerender } = render(<SideSheet {...props} />)
    const panel = document.querySelector('[data-side-sheet="speed"]') as HTMLElement
    // The body's fill and its one left edge come from the shared module, not from this file.
    for (const cls of SIDE_PANEL_BODY_CLASS.split(' ')) expect(panel.className).toContain(cls)
    expect(panel).toHaveAttribute('role', 'complementary')
    // The header IS the 40px chrome row — `sheetFrame.ts`'s own, not a copy of it. Every class
    // of it survives except `gap-2`, which the tab row deliberately tightens to `gap-0.5`; that
    // one exception is asserted rather than skipped, so a second divergence cannot creep in.
    const header = screen.getByRole('tablist')
    for (const cls of CHROME_ROW_CLASS.split(' ')) {
      if (cls === 'gap-2') continue
      expect(header.className).toContain(cls)
    }
    expect(header.className).toContain('gap-0.5')
    expect(header.className).not.toContain('gap-2')
    // Already open on the first render is not "opening": no animation on arrival at the route.
    expect(panel.className).not.toContain('animate-in')

    // Folded, the strip is the rail's 40px one — not the phone handle's 44.
    setBuskSheet('none')
    rerender(<SideSheet {...props} />)
    const strip = document.querySelector('[data-side-sheet="none"]') as HTMLElement
    for (const cls of SIDE_PANEL_STRIP_CLASS.split(' ')) expect(strip.className).toContain(cls)
    expect(strip.className).not.toContain('w-11')

    // Unfolding is an opening, so this one animates.
    fireEvent.click(screen.getByRole('button', { name: 'Unfold the side sheet' }))
    rerender(<SideSheet {...props} />)
    expect((document.querySelector('[data-side-sheet="speed"]') as HTMLElement).className).toContain(
      'animate-in',
    )
  })

  it('opens no narrower than its header needs, lifting a width stored below that floor', () => {
    // The row is three labelled tabs plus the mode toggle and the fold chevron inside the chrome
    // row's 12px gutters — 304px measured — so at the shared 260 both buttons were pushed clean
    // outside the panel. A desk that stored the old width is lifted on read.
    window.localStorage.setItem('busk.sheet.width', JSON.stringify(260))
    setBuskSheet('speed')
    render(<SideSheet {...props} />)
    const panel = document.querySelector('[data-side-sheet="speed"]') as HTMLElement
    expect(Number.parseInt(panel.style.getPropertyValue('--sheet-w'), 10)).toBeGreaterThanOrEqual(320)
  })

  it('lets the tabs give before the header’s buttons do', () => {
    // Insurance rather than a live case: `SHEET_MIN_WIDTH` keeps the row fitting today. It is
    // here so the next control added to that row degrades — clipping the end of the tab strip —
    // instead of pushing the toggle and the chevron outside the panel, which is exactly what
    // adding the mode toggle did.
    setBuskSheet('speed')
    render(<SideSheet {...props} />)
    const tablist = screen.getByRole('tablist')
    const group = tablist.querySelector('div') as HTMLElement
    expect(group.className).toContain('min-w-0')
    expect(group.className).toContain('overflow-hidden')
    expect(group.className).toContain('flex-1')
    for (const name of ['Fold the side sheet', 'Show the panel over the content']) {
      expect(screen.getByRole('button', { name }).className).toContain('shrink-0')
    }
  })

  it('draws the fold for a fact naming a tab that has not landed — none today, so the gate is pinned on the list', () => {
    // Every tab has landed; what remains is the mechanism a fourth tab would land through. The
    // strip draws exactly the live list, and nothing outside `LIVE_SHEET_TABS` reaches it.
    expect(sideSheetTabs('docked').every((tab) => LIVE_SHEET_TABS.includes(tab.id))).toBe(true)
    expect(SIDE_SHEET_TABS.map((t) => t.id)).toEqual([...LIVE_SHEET_TABS])
  })
})

describe('the overlay, off the desk board', () => {
  it('carries Colour and Spread and no Speed tab in any overlay form — Speed is the ShowBar’s chip there (D7)', () => {
    expect(sideSheetTabs('bottom-sheet').map((t) => t.id)).toEqual(['colour', 'spread'])
    expect(sideSheetTabs('side-sheet').map((t) => t.id)).toEqual(['colour', 'spread'])
    // `popover` is what a 640–767px window answers, where the rail is still not drawn: an overlay
    // with a Speed tab there would open onto nothing.
    expect(sideSheetTabs('popover').map((t) => t.id)).toEqual(['colour', 'spread'])
  })

  it('opens onto Spread as a right-hand sheet on the short board, compact, and Second colour crosses over to it', () => {
    surface({ short: true })
    setBuskSheet('colour')
    render(<SideSheetOverlay {...props} />)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Second colour' }))
    expect(getBuskSheet()).toBe('spread')
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('tab', { name: 'Spread' })).toHaveAttribute('aria-selected', 'true')
    expect(within(dialog).getByTestId('spread-sheet')).toHaveAttribute('data-compact', 'true')
    expect(within(dialog).getByTestId('spread-sheet')).toHaveAttribute('data-seed', JSON.stringify({ r: 245, g: 179, b: 66 }))
  })

  it('opens onto Colour as a bottom sheet below md, full layout, and closing writes none', () => {
    surface({ narrow: true })
    setBuskSheet('colour')
    render(<SideSheetOverlay {...props} />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('tab', { name: 'Colour' })).toHaveAttribute('aria-selected', 'true')
    expect(within(dialog).queryByRole('tab', { name: 'Speed' })).toBeNull()
    expect(within(dialog).getByTestId('colour-sheet')).toHaveAttribute('data-compact', 'false')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(getBuskSheet()).toBe('none')
  })

  it('opens onto Colour as a right-hand sheet on the short board, in the compact layout', () => {
    surface({ short: true })
    setBuskSheet('colour')
    render(<SideSheetOverlay {...props} />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByTestId('colour-sheet')).toHaveAttribute('data-compact', 'true')
    expect(within(dialog).queryByRole('tab', { name: 'Speed' })).toBeNull()
  })

  it('never opens on speed off the desk board, having no Speed tab to open onto', () => {
    surface({ narrow: true })
    setBuskSheet('speed')
    render(<SideSheetOverlay {...props} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

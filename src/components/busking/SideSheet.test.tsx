// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { getBuskSheet, resetBuskWindowStores, setBuskSheet } from '@/lib/buskWindow'
import { resetCellEditorSurfaceMedia } from '@/components/sheet/cells/CellEditorSurface'
import type { BuskingTarget } from './buskingTypes'

/**
 * The side sheet (busk-further plan D7): two live tabs — Speed and, since session 5, Colour — and
 * the fold; the fold keeps the beat, master 1's tempo, the tab glyphs and the selection's colour;
 * off the desk board the sheet is an overlay carrying no Speed tab. The sheet is one fact —
 * `busk.sheet`, `none` for the fold.
 */

vi.mock('./BuskSpeedRail', () => ({ BuskSpeedRail: () => <div data-testid="speed-rail" /> }))
vi.mock('./ColourSheet', () => ({
  ColourSheet: ({ compact }: { compact?: boolean }) => <div data-testid="colour-sheet" data-compact={compact ? 'true' : 'false'} />,
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

import { SideSheet, SideSheetOverlay, sideSheetTabs } from './SideSheet'

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
  it('offers Speed and Colour, with Spread hidden until its session lands', () => {
    setBuskSheet('speed')
    render(<SideSheet {...props} />)
    const tabs = within(screen.getByRole('tablist', { name: 'Side sheet' })).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Speed', 'Colour'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('speed-rail')).toBeInTheDocument()
    expect(sideSheetTabs('docked').map((t) => t.id)).toEqual(['speed', 'colour'])
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
    expect(screen.queryByRole('button', { name: 'Open the Spread tab' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open the Colour tab' }))
    expect(getBuskSheet()).toBe('colour')
  })

  it('unfolds onto a tab from the chevron', () => {
    setBuskSheet('none')
    render(<SideSheet {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unfold the side sheet' }))
    expect(getBuskSheet()).toBe('speed')
  })

  it('draws the fold for a fact naming a tab that has not landed', () => {
    setBuskSheet('spread')
    render(<SideSheet {...props} />)
    expect(document.querySelector('[data-side-sheet="none"]')).not.toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
  })
})

describe('the overlay, off the desk board', () => {
  it('carries no Speed tab in any overlay form — Speed is the ShowBar’s chip there (D7)', () => {
    expect(sideSheetTabs('bottom-sheet').map((t) => t.id)).toEqual(['colour'])
    expect(sideSheetTabs('side-sheet').map((t) => t.id)).toEqual(['colour'])
    // `popover` is what a 640–767px window answers, where the rail is still not drawn: an overlay
    // with a Speed tab there would open onto nothing.
    expect(sideSheetTabs('popover').map((t) => t.id)).toEqual(['colour'])
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

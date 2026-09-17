// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { getBuskSheet, resetBuskWindowStores, setBuskSheet } from '@/lib/buskWindow'
import { resetCellEditorSurfaceMedia } from '@/components/sheet/cells/CellEditorSurface'
import type { BuskingTarget } from './buskingTypes'

/**
 * The side sheet (busk-further plan D7): one live tab and the fold this session; the fold keeps
 * the beat, master 1's tempo, the tab glyphs and the selection's colour; below `md` the sheet
 * carries no Speed tab. The sheet is one fact — `busk.sheet`, `none` for the fold.
 */

vi.mock('./BuskSpeedRail', () => ({ BuskSpeedRail: () => <div data-testid="speed-rail" /> }))
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

beforeEach(() => surface())

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
  resetBuskWindowStores()
  resetCellEditorSurfaceMedia()
  vi.unstubAllGlobals()
})

describe('docked, md and up', () => {
  it('offers one live tab — Speed — with Colour and Spread hidden until their sessions land', () => {
    setBuskSheet('speed')
    render(<SideSheet projectId={1} selectedTargets={selection} />)
    const tabs = within(screen.getByRole('tablist', { name: 'Side sheet' })).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Speed'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('speed-rail')).toBeInTheDocument()
    expect(sideSheetTabs('docked').map((t) => t.id)).toEqual(['speed'])
  })

  it('folds to the strip on the chevron, writing none — the sheet is one fact', () => {
    setBuskSheet('speed')
    render(<SideSheet projectId={1} selectedTargets={selection} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fold the side sheet' }))
    expect(getBuskSheet()).toBe('none')
    expect(document.querySelector('[data-side-sheet="none"]')).not.toBeNull()
    expect(screen.queryByTestId('speed-rail')).toBeNull()
    expect(Object.keys(window.sessionStorage).some((k) => /open/i.test(k))).toBe(false)
  })

  it('keeps the beat, master 1’s tempo, the tab glyphs, the selection’s colour and its head count on the fold', () => {
    setBuskSheet('none')
    render(<SideSheet projectId={1} selectedTargets={selection} />)
    expect(screen.getByTestId('beat')).toHaveAttribute('data-master', '1')
    expect(document.querySelector('[data-fold-tempo]')).toHaveTextContent('120')
    expect(document.querySelector('[data-fold-heads]')).toHaveTextContent('7')
    expect((document.querySelector('[data-fold-colour]') as HTMLElement).style.background).toBe('rgb(255, 0, 0)')
    // One glyph per live tab; a tap unfolds onto it.
    expect(screen.queryByRole('button', { name: 'Open the Colour tab' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open the Speed tab' }))
    expect(getBuskSheet()).toBe('speed')
  })

  it('unfolds onto a tab from the chevron', () => {
    setBuskSheet('none')
    render(<SideSheet projectId={1} selectedTargets={selection} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unfold the side sheet' }))
    expect(getBuskSheet()).toBe('speed')
  })

  it('draws the fold for a fact naming a tab that has not landed', () => {
    setBuskSheet('colour')
    render(<SideSheet projectId={1} selectedTargets={selection} />)
    expect(document.querySelector('[data-side-sheet="none"]')).not.toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
  })
})

describe('below md', () => {
  it('carries no Speed tab in any overlay form — Speed is the ShowBar’s chip there (D7)', () => {
    expect(sideSheetTabs('bottom-sheet').map((t) => t.id)).not.toContain('speed')
    expect(sideSheetTabs('side-sheet').map((t) => t.id)).not.toContain('speed')
    // `popover` is what a 640–767px window answers, where the rail is still not drawn: an overlay
    // with a Speed tab there would open onto nothing.
    expect(sideSheetTabs('popover').map((t) => t.id)).not.toContain('speed')
    // With Colour and Spread still to land, that leaves nothing to show.
    expect(sideSheetTabs('bottom-sheet')).toEqual([])
  })

  it('never opens on speed as a bottom sheet, having no tab to open onto', () => {
    surface({ narrow: true })
    setBuskSheet('speed')
    render(<SideSheetOverlay />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('never opens on speed at 640–767px either, where the form is a popover and the rail is not drawn', () => {
    surface()
    setBuskSheet('speed')
    render(<SideSheetOverlay />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

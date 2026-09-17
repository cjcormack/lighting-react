// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { DeskWindow } from '@/api/windowsApi'
import type { DeskSelectionSnapshot } from '@/api/selectionApi'
import { resetDeskFollowStores } from '@/lib/deskFollow'

const desk: { snapshot: DeskSelectionSnapshot } = { snapshot: { targets: [], families: null, source: null } }
const registry: { windows: DeskWindow[] } = { windows: [] }

vi.mock('@/store/selection', () => ({ useDeskSelectionSnapshot: () => desk.snapshot }))
vi.mock('@/store/windows', async () => {
  const real = await import('@/store/windows')
  return { useDeskWindows: () => registry.windows, thisWindowRow: real.thisWindowRow }
})
vi.mock('@/lib/windowIdentity', () => ({
  useWindowName: () => 'Screen 1',
  windowId: () => 'w-1',
}))

import { DeskChip, deskReading } from './DeskChip'

/**
 * The desk chip resolves *this window* through `windows.state` (multi-screen plan D7, lighting7
 * d774fd9): `source.id` is the mover's socket-minted row id, this tab's row is the one carrying
 * its `windowId`, and the two are compared by id — the name is only the fallback for a source
 * that carries none.
 */
const row = (id: string, windowId: string, name: string): DeskWindow => ({
  id,
  windowId,
  name,
  view: '/projects/1/programmer',
  fullscreen: false,
  follows: true,
  user: null,
  viewOptions: null,
})

afterEach(() => {
  desk.snapshot = { targets: [], families: null, source: null }
  registry.windows = []
  window.sessionStorage.clear()
  resetDeskFollowStores()
})

describe('deskReading', () => {
  const me = { id: 's-1', name: 'Screen 1' }

  it('reads Desk when source.id is this window’s row id — even under a name that is not ours', () => {
    // A rename that has not round-tripped yet: the id is what matched, not the name.
    expect(deskReading({ kind: 'window', id: 's-1', name: 'Old name' }, me).from).toBeNull()
  })

  it('names the other row when source.id is another window’s, by that row’s current name', () => {
    const windows = [row('s-1', 'w-1', 'Screen 1'), row('s-2', 'w-2', 'Screen 2 renamed')]
    expect(deskReading({ kind: 'window', id: 's-2', name: 'Screen 2' }, me, windows).from).toBe('Screen 2 renamed')
    // A row that has since left keeps the name the write was stamped with.
    expect(deskReading({ kind: 'window', id: 's-9', name: 'Gone' }, me, windows).from).toBe('Gone')
  })

  it('does not let a twin with our name read as ours when the ids differ', () => {
    // The twin is a live row, so its id resolves and decides; the shared name is ignored.
    const windows = [row('s-1', 'w-1', 'Screen 1'), row('s-2', 'w-1', 'Screen 1')]
    expect(deskReading({ kind: 'window', id: 's-2', name: 'Screen 1' }, me, windows).from).toBe('Screen 1')
  })

  it('falls back to the name when source.id is absent (a socket that never announced)', () => {
    expect(deskReading({ kind: 'window', name: 'Screen 1' }, me).from).toBeNull()
    expect(deskReading({ kind: 'window', name: 'Screen 2' }, me).from).toBe('Screen 2')
  })

  it('falls back to the name when this window has no row yet', () => {
    const noRow = { id: null, name: 'Screen 1' }
    expect(deskReading({ kind: 'window', id: 's-1', name: 'Screen 1' }, noRow).from).toBeNull()
    expect(deskReading({ kind: 'window', id: 's-2', name: 'Screen 2' }, noRow).from).toBe('Screen 2')
  })

  it('does not name this window as the mover after a reconnect leaves its own old row id behind', () => {
    // The row id is socket-minted, so a reconnect gives this tab a new one while the desk's
    // standing selection still carries the old; the old row is gone from the registry, so the id
    // cannot decide and the name does — which reads as our own write, as it is.
    const afterReconnect = { id: 's-2', name: 'Screen 1' }
    const windows = [row('s-2', 'w-1', 'Screen 1')]
    expect(deskReading({ kind: 'window', id: 's-1', name: 'Screen 1' }, afterReconnect, windows).from).toBeNull()
    // …but a still-registered other row keeps deciding by id even when it shares our name.
    const twin = [row('s-2', 'w-1', 'Screen 1'), row('s-3', 'w-1', 'Screen 1')]
    expect(deskReading({ kind: 'window', id: 's-3', name: 'Screen 1' }, afterReconnect, twin).from).toBe('Screen 1')
  })

  it('reads the desk for a control surface, whatever id it carries', () => {
    expect(deskReading({ kind: 'surface', name: 'Control surface' }, me).from).toBe('the desk')
  })

  it('reads plain Desk for no mover', () => {
    expect(deskReading(null, me)).toEqual({ from: null, detail: 'Following the desk selection' })
  })
})

describe('DeskChip', () => {
  it('finds its own row by windowId and reads Desk for its own write', () => {
    registry.windows = [row('s-1', 'w-1', 'Screen 1'), row('s-2', 'w-2', 'Screen 2')]
    desk.snapshot = { targets: [], families: null, source: { kind: 'window', id: 's-1', name: 'Screen 1' } }
    render(<DeskChip />)
    expect(screen.getByRole('button', { name: 'Desk' })).toBeInTheDocument()
  })

  it('names the other window for its write, by row id', () => {
    registry.windows = [row('s-1', 'w-1', 'Screen 1'), row('s-2', 'w-2', 'Screen 2')]
    desk.snapshot = { targets: [], families: null, source: { kind: 'window', id: 's-2', name: 'Screen 2' } }
    render(<DeskChip />)
    expect(screen.getByRole('button', { name: 'Desk · from Screen 2' })).toBeInTheDocument()
  })

  it('takes the first row carrying its windowId — a duplicated tab is two rows it cannot tell apart', () => {
    registry.windows = [row('s-1', 'w-1', 'Screen 1'), row('s-3', 'w-1', 'Screen 1')]
    desk.snapshot = { targets: [], families: null, source: { kind: 'window', id: 's-3', name: 'Screen 1' } }
    render(<DeskChip />)
    // The twin moved it; this tab reads it as another window. Cosmetic, accepted by D9.
    expect(screen.getByRole('button', { name: 'Desk · from Screen 1' })).toBeInTheDocument()
  })
})

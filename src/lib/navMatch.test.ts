// @vitest-environment jsdom
// jsdom provides `window`, which `navigation.ts` pulls in transitively via store/universes →
// api/lightingApi (it reads window.location at import time).
import { describe, expect, it } from 'vitest'
import { navItems } from '../navigation'
import { mostSpecificActiveId } from './navMatch'

/**
 * The sibling-route collision, pinned rather than described.
 *
 * `/programmer` and `/show` are two live views whose names would prefix each other under a naive
 * `startsWith`, and a `programmer` nav entry was left out of the sidebar once already on exactly
 * that reasoning. These assertions are what make adding it safe.
 */
describe('mostSpecificActiveId', () => {
  const nav = navItems.map(({ id, pathMatch }) => ({ id, pathMatch }))

  it('keeps the programmer and the show apart', () => {
    expect(mostSpecificActiveId(nav, '/projects/7/programmer')).toBe('programmer')
    expect(mostSpecificActiveId(nav, '/projects/7/show')).toBe('program')
  })

  it('keeps a drilled stack on the show entry', () => {
    expect(mostSpecificActiveId(nav, '/projects/7/show/stacks/5')).toBe('program')
  })

  it('prefers the longest match, so a child tab beats its parent', () => {
    expect(mostSpecificActiveId(nav, '/projects/7/settings')).toBe('project-settings')
    expect(mostSpecificActiveId(nav, '/projects/7/settings/patches')).toBe('patches')
  })

  it('matches whole segments only', () => {
    // Not `startsWith`: a pathname is `/projects/7/looks`, never `/looks`, and a route merely
    // *containing* another's name must not light it up.
    expect(mostSpecificActiveId([{ id: 'a', pathMatch: '/run' }], '/projects/7/runner')).toBeNull()
    expect(mostSpecificActiveId([{ id: 'a', pathMatch: '/run' }], '/projects/7/run')).toBe('a')
    expect(mostSpecificActiveId([{ id: 'a', pathMatch: '/run' }], '/projects/7/run/x')).toBe('a')
  })

  it('returns null when nothing matches', () => {
    expect(mostSpecificActiveId(nav, '/projects')).toBeNull()
  })
})

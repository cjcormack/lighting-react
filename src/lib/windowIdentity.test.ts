// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WINDOW_NAME_KEY, resetWindowIdentity, useWindowName, windowName } from './windowIdentity'

/**
 * This tab's name (multi-screen plan D10, the session-1 stub): `?window=` read once and
 * stripped, `sessionStorage` across a reload, a minted `Window xxxx` otherwise.
 */

beforeEach(() => {
  window.history.replaceState(null, '', '/projects/1/programmer')
})

afterEach(() => {
  window.sessionStorage.clear()
  resetWindowIdentity()
})

describe('windowName', () => {
  it('mints `Window` plus a short suffix for a tab opened by hand, once', () => {
    const name = windowName()
    expect(name).toMatch(/^Window [0-9a-z]{4}$/)
    expect(windowName()).toBe(name)
    expect(useWindowName()).toBe(name)
    expect(window.sessionStorage.getItem(WINDOW_NAME_KEY)).toBe(name)
  })

  it('takes the name from `?window=`, strips it from the URL, and keeps the rest of the query', () => {
    window.history.replaceState(null, '', '/projects/1/busk?page=4&window=Screen%202')
    expect(windowName()).toBe('Screen 2')
    expect(window.location.search).toBe('?page=4')
    expect(window.sessionStorage.getItem(WINDOW_NAME_KEY)).toBe('Screen 2')
  })

  it('reads the stored name after a reload rather than minting a new one', () => {
    window.sessionStorage.setItem(WINDOW_NAME_KEY, 'Screen 1')
    expect(windowName()).toBe('Screen 1')
  })

  it('prefers the stored name to a stale `?window=` on a reload of the stripped URL', () => {
    // The parameter was consumed at first boot; a bookmark of the launch URL re-opened in the same
    // tab must not rename it.
    window.sessionStorage.setItem(WINDOW_NAME_KEY, 'Screen 1')
    window.history.replaceState(null, '', '/?window=Screen%202')
    expect(windowName()).toBe('Screen 1')
    // …and the parameter is still consumed, or the URL would carry it for the life of the tab.
    expect(window.location.search).toBe('')
  })

  it('ignores a blank `?window=`', () => {
    window.history.replaceState(null, '', '/?window=%20')
    expect(windowName()).toMatch(/^Window /)
    expect(window.location.search).toBe('')
  })
})

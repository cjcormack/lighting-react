/**
 * This tab's **name** — the session-1 stub of multi-screen plan D10, and deliberately no more.
 *
 * A window is a socket carrying a client-minted identity (D9); until the windows registry lands
 * in session 2 the only identity a window has is the `sourceName` it puts on a `selection.set` or
 * `selection.toggle`, which the desk remembers on that socket and stamps as the selection's
 * `source` (D7). So every selection write from this tab carries [windowName], and the chip on
 * another screen can read *Desk · from Screen 1* before any registry exists. Session 2 replaces
 * this module with the announced identity; keep it small.
 *
 * Where the name comes from, in order:
 *
 *  - **`sessionStorage`**, so it survives a reload of this tab and is never shared with another —
 *    `localStorage` is one value per origin per profile, and the two desk screens are two windows
 *    of one profile (D8).
 *  - **`?window=` on the launch URL**, read once and stripped. That is what lets a shortcut, a
 *    home-screen icon or a copied link name its window durably without a per-browser store the two
 *    desk screens would share. It is read at boot, before the router is created (`main.tsx`), so
 *    the router never sees the parameter.
 *  - **`Window` plus a short suffix** for a tab opened by hand.
 *
 * There is **no `open` branch re-sending the name**. The shipped wire (lighting7 af3575a) has no
 * name-only frame — a socket names itself only on a write — and a `selection.set` sent on connect
 * would *replace* the desk's selection and make this tab its last mover. Every write carries the
 * name instead, so a reconnected socket is named again by the first write it makes; a socket that
 * has made none stamps no source, which is the desk's own rule.
 */

export const WINDOW_NAME_KEY = 'desk.windowName'
export const WINDOW_NAME_PARAM = 'window'

let cached: string | null = null

/** The tab's name, minted on first call and stable for the life of the tab. */
export function windowName(): string {
  if (cached != null) return cached
  // The launch parameter is consumed whether or not it wins: a tab that already has a name and is
  // sent to a `?window=` URL again (the desktop shortcut clicked with the tab open) keeps its name
  // and still loses the parameter, or the URL would carry it for the life of the tab.
  const launch = readLaunchParam()
  cached = readStored() ?? launch ?? `Window ${shortSuffix()}`
  writeStored(cached)
  return cached
}

/** A React reader. Static for the tab, so a plain call: there is nothing to subscribe to. */
export function useWindowName(): string {
  return windowName()
}

/** Test seam: forget the cached name so each test starts from storage and the URL. */
export function resetWindowIdentity(): void {
  cached = null
}

function readStored(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(WINDOW_NAME_KEY)
    return raw != null && raw.trim() !== '' ? raw : null
  } catch {
    return null
  }
}

function writeStored(name: string): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(WINDOW_NAME_KEY, name)
  } catch {
    // Storage unavailable — the in-memory name still serves this tab.
  }
}

/** `?window=Screen%202`, consumed: read, then stripped from the URL with `replaceState`. */
function readLaunchParam(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const url = new URL(window.location.href)
    const raw = url.searchParams.get(WINDOW_NAME_PARAM)
    if (raw == null) return null
    url.searchParams.delete(WINDOW_NAME_PARAM)
    window.history.replaceState(window.history.state, '', url)
    const name = raw.trim()
    return name === '' ? null : name
  } catch {
    return null
  }
}

function shortSuffix(): string {
  const bytes = new Uint8Array(3)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 4)
}

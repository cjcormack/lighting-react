import { useSyncExternalStore } from 'react'

/**
 * This tab's **identity**: a client-minted `windowId` and a `name` (multi-screen plan D9, D10).
 *
 * A window is a socket carrying a client-minted identity. The desk's windows registry
 * (`api/windowsApi.ts`) keys its rows by *socket* — the row's `id` is minted server-side and comes
 * back on `windows.state` — and this tab announces the two facts held here on every connect and
 * every change, so the registry can recognise the same tab across a reload and a reconnect.
 *
 * Both live in **`sessionStorage`**, never `localStorage`: the two desk screens are two windows of
 * one browser profile, and `localStorage` is one value per origin per profile — an identity kept
 * there would be one identity for both screens (D8's reason, applied to D9). `sessionStorage` is
 * per tab and survives a reload of that tab, which is exactly the lifetime a window identity wants.
 *
 * - **`windowId`** is a uuid minted once into storage. The client resolves "my row" in
 *   `windows.state` by matching it (`store/windows.ts`); the socket-minted row `id` is what every
 *   command addresses. A *duplicated* tab copies its `sessionStorage`, so two rows can share one
 *   `windowId`: they are still two rows, separately addressable, and the client simply cannot tell
 *   them apart (D9 accepts that; `FU-WINDOWS-OWN-ROW-ID` in lighting7 is the exact fix).
 * - **`name`** comes, in order, from `sessionStorage`; from **`?window=` on the launch URL**, read
 *   once at boot before the router is created (`main.tsx`) and stripped, which is what lets a
 *   shortcut, a Dock app, a home-screen icon or a copied link name its window durably without a
 *   per-browser store; else *Window* plus a short suffix for a tab opened by hand. It can be renamed
 *   for the life of the tab — from this window or, through `windows.rename`, from any other.
 *
 * The name is a subscribable, so the desk chip, the user menu and the announce all move on a
 * rename; the id is static for the tab, so it is a plain read.
 */

export const WINDOW_ID_KEY = 'desk.windowId'
export const WINDOW_NAME_KEY = 'desk.windowName'
export const WINDOW_NAME_PARAM = 'window'

let cachedId: string | null = null
let cachedName: string | null = null
const nameListeners = new Set<() => void>()

/** The tab's client-minted identity, minted on first call and stable for the life of the tab. */
export function windowId(): string {
  if (cachedId != null) return cachedId
  cachedId = readStored(WINDOW_ID_KEY) ?? mintUuid()
  writeStored(WINDOW_ID_KEY, cachedId)
  return cachedId
}

/** The tab's name, minted on first call and stable until [renameWindow]. */
export function windowName(): string {
  if (cachedName != null) return cachedName
  // The launch parameter is consumed whether or not it wins: a tab that already has a name and is
  // sent to a `?window=` URL again (the desktop shortcut clicked with the tab open) keeps its name
  // and still loses the parameter, or the URL would carry it for the life of the tab.
  const launch = readLaunchParam()
  cachedName = readStored(WINDOW_NAME_KEY) ?? launch ?? `Window ${shortSuffix()}`
  writeStored(WINDOW_NAME_KEY, cachedName)
  return cachedName
}

/**
 * Rename this tab. A blank name is refused rather than stored — the registry would show an
 * unlabelled row and the chip an empty `from`. Returns whether anything changed, so a caller can
 * skip a re-announce for a no-op.
 */
export function renameWindow(next: string): boolean {
  const name = next.trim()
  if (name === '' || name === windowName()) return false
  cachedName = name
  writeStored(WINDOW_NAME_KEY, name)
  for (const fn of [...nameListeners]) fn()
  return true
}

/** `useSyncExternalStore`'s subscribe for the name. */
export function subscribeWindowName(fn: () => void): () => void {
  nameListeners.add(fn)
  return () => {
    nameListeners.delete(fn)
  }
}

/** A React reader of the name, re-rendering on a rename. */
export function useWindowName(): string {
  return useSyncExternalStore(subscribeWindowName, windowName, windowName)
}

/** Test seam: forget both cached values so each test starts from storage and the URL. */
export function resetWindowIdentity(): void {
  cachedId = null
  cachedName = null
  nameListeners.clear()
}

function readStored(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(key)
    return raw != null && raw.trim() !== '' ? raw : null
  } catch {
    return null
  }
}

function writeStored(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // Storage unavailable — the in-memory value still serves this tab.
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

function mintUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // A non-secure context has no `randomUUID`, and the desk over the LAN is one (D13): the same
  // 122 random bits, spelled by hand.
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function shortSuffix(): string {
  const bytes = new Uint8Array(3)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 4)
}

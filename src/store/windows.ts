import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import type { DeskWindow, WindowAnnounce } from '../api/windowsApi'
import { windowId } from '../lib/windowIdentity'

/**
 * The desk's windows registry — see `api/windowsApi.ts` for the wire and its rules.
 *
 * **Where this bridge subscribes** (CLAUDE.md §"Where a WS bridge subscribes"): **form 3**, per
 * cache entry, and nothing at module scope. The registry is a *stream* — the value itself arrives
 * over WS and there is nothing to refetch — so it is `deskSelection`'s shape exactly: `queryFn`
 * seeds from the WS layer's snapshot and every later frame is `updateCachedData`. That also
 * settles the form-1-or-2 question the plan left open: `UserMenu` imports this module and sits on
 * the earliest render path, so a bare `lightingApi.x.subscribe(…)` here would need to be deferred
 * to `main.tsx`; a `queryFn` that *closes over* `lightingApi` touches it only when the first reader
 * mounts, long after every module has evaluated, and needs no `startXBridge()`.
 *
 * The rest of the family lives in a hook rather than here: the announce needs the router's
 * location and the `windows.show` handler needs its `navigate`, both of which exist only inside
 * `RouterProvider` — `components/screens/useWindowsBridge.ts`, mounted once in `Layout`.
 *
 * Not project-keyed, for the reason `deskSelection` is not: the registry is machine-scoped and a
 * window outlives a project switch.
 */

const NO_WINDOWS: DeskWindow[] = []

export const windowsApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    deskWindows: build.query<DeskWindow[], void>({
      queryFn: () => ({ data: lightingApi.windows.getState() ?? NO_WINDOWS }),
      async onCacheEntryAdded(_, { cacheDataLoaded, updateCachedData, cacheEntryRemoved }) {
        await cacheDataLoaded
        const subscription = lightingApi.windows.subscribe((windows) => {
          updateCachedData(() => windows)
        })
        await cacheEntryRemoved
        subscription.unsubscribe()
      },
    }),
  }),
  overrideExisting: false,
})

export const { useDeskWindowsQuery } = windowsApi

/** Every signed-in window, in announce order. Empty until the show is warm and this tab has heard. */
export function useDeskWindows(): DeskWindow[] {
  const { data } = useDeskWindowsQuery()
  return data ?? NO_WINDOWS
}

/**
 * This tab's row: the one whose `windowId` is ours. **First match** — a duplicated tab copies its
 * `sessionStorage`, so two rows can share the id and neither tab can tell which is which (D9
 * accepts that as cosmetic; `FU-WINDOWS-OWN-ROW-ID` is the exact fix). Null before this tab's
 * announce has been handled.
 */
export function thisWindowRow(windows: readonly DeskWindow[], id: string = windowId()): DeskWindow | null {
  return windows.find((w) => w.windowId === id) ?? null
}

export function useThisWindow(): DeskWindow | null {
  return thisWindowRow(useDeskWindows())
}

/** The row id this tab answers to, read at command time rather than through a hook. */
export function thisWindowRowId(): string | null {
  return thisWindowRow(lightingApi.windows.getState() ?? NO_WINDOWS)?.id ?? null
}

/** Say what this window is. `windowId` is always this tab's; the caller supplies the rest. */
export function announceThisWindow(facts: Omit<WindowAnnounce, 'windowId'>): void {
  lightingApi.windows.announce({ windowId: windowId(), ...facts })
}

/** Ask another window (or this one, by its row id) to show a view. */
export function showOnWindow(targetId: string, view: string): void {
  lightingApi.windows.show(targetId, view)
}

/**
 * Rename a window by its row id. Nothing is applied here even when the target is this tab: the
 * command is rebroadcast and the target — this tab included — renames itself in its handler,
 * so one path serves both and the sheet cannot rename a row the desk will not.
 */
export function renameWindowRow(targetId: string, name: string): void {
  lightingApi.windows.rename(targetId, name)
}

/** Ask a window to enter (banner on the target) or leave (immediate) full screen. */
export function setWindowFullscreen(targetId: string, on: boolean): void {
  lightingApi.windows.fullscreen(targetId, on)
}

/**
 * Set a window's per-view options — its busk focus, sheet or page (busk-further plan D13). [view]
 * is the route the row announced, and the target applies the options only while it is still
 * showing that view. Like a rename, nothing is applied here even for this tab: the command comes
 * back rebroadcast and the target — this tab included — applies it in its handler, so the sheet
 * cannot set a fact the desk never heard of.
 */
export function setWindowViewOptions(targetId: string, view: string, options: Readonly<Record<string, string>>): void {
  lightingApi.windows.viewOptions(targetId, view, options)
}

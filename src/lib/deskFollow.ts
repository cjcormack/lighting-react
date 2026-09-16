import { useSyncExternalStore } from 'react'
import type { CueTarget } from '../api/cuesApi'
import type { AttributeFamily } from './attributeFamily'
import { normaliseFamilies, parseFamilies } from './selectionMask'
import { createSyncStore, sessionStorageArea } from './syncStore'

/**
 * **Follow / local** — whether this tab's selection is the desk's (multi-screen plan D1, D8).
 *
 * A window follows the desk by default: every console makes a second screen a view on one
 * programmer, and a window that started unlinked would look broken (the band on the other screen
 * stays dark). A tab unlinks by clicking its desk chip, and what it gets is a selection of its own —
 * on the busk view a Map held here, on the programmer the list's own row selection — that a press
 * from this tab acts on instead of the desk's.
 *
 * Three rules, each with a reason:
 *
 * - **Per tab, in `sessionStorage`.** `localStorage` is one value per origin per profile, and the
 *   two desk screens are two windows of one profile — a flag kept there would be one flag for both.
 *   A `createSyncStore` singleton rather than a `useState`, because the chip, the bridge and the
 *   busk hook all read it and must move together.
 * - **Unlinking snapshots the desk's selection — targets *and* families — and leaves the desk's
 *   alone.** The operator unlinked to keep working on what they had, not to start from nothing.
 * - **Re-linking adopts the desk's, and publishes nothing.** The bridge's "never publish on mount"
 *   rule, for its reason: a window joining must not clear what another screen has selected.
 *   [relinkToDesk] therefore drops the local copy rather than sending it.
 *
 * It gates **both** directions of `useDeskSelectionBridge`, since one bridge is both.
 */

export const DESK_FOLLOW_KEY = 'desk.follow'
export const LOCAL_SELECTION_KEY = 'desk.localSelection'

/** What an unlinked tab holds: the desk's fact as it stood when the tab unlinked, then its own. */
export interface LocalSelection {
  targets: CueTarget[]
  /** `null` is every attribute — the one spelling, as on the desk. */
  families: AttributeFamily[] | null
}

const EMPTY_LOCAL: LocalSelection = { targets: [], families: null }

const followStore = createSyncStore<boolean>({
  key: DESK_FOLLOW_KEY,
  fallback: true,
  parse: (parsed) => (typeof parsed === 'boolean' ? parsed : true),
  storage: sessionStorageArea,
})

const localStore = createSyncStore<LocalSelection>({
  key: LOCAL_SELECTION_KEY,
  fallback: EMPTY_LOCAL,
  parse: parseLocalSelection,
  storage: sessionStorageArea,
})

/** Is this tab following the desk's selection? Re-renders every reader when it flips. */
export function useDeskFollow(): boolean {
  return useSyncExternalStore(followStore.subscribe, followStore.getSnapshot, followStore.getServerSnapshot)
}

/** For a reader that only needs the answer at press time. */
export function isFollowingDesk(): boolean {
  return followStore.getSnapshot()
}

/** The tab's own selection while unlinked. Meaningful only while [useDeskFollow] is false. */
export function useLocalSelection(): LocalSelection {
  return useSyncExternalStore(localStore.subscribe, localStore.getSnapshot, localStore.getServerSnapshot)
}

export function getLocalSelection(): LocalSelection {
  return localStore.getSnapshot()
}

/** Replace the tab's own selection. A no-op while following: the desk's is not edited here. */
export function setLocalSelection(next: LocalSelection): void {
  localStore.set({ targets: [...next.targets], families: normaliseFamilies(next.families) })
}

/**
 * Unlink: take the desk's selection as this tab's own and stop following. The desk's is untouched.
 * [snapshot] is what the caller is showing — the desk's fact, from `useDeskSelectionSnapshot`.
 */
export function unlinkFromDesk(snapshot: LocalSelection): void {
  setLocalSelection(snapshot)
  followStore.set(false)
}

/** Re-link: follow the desk again and drop the local copy. Nothing is published. */
export function relinkToDesk(): void {
  followStore.set(true)
  localStore.set(EMPTY_LOCAL)
}

/** Test seam: both stores back to their fallbacks with no listeners. */
export function resetDeskFollowStores(): void {
  followStore.reset()
  localStore.reset()
}

function parseLocalSelection(parsed: unknown): LocalSelection {
  if (parsed == null || typeof parsed !== 'object') return EMPTY_LOCAL
  const raw = parsed as { targets?: unknown; families?: unknown }
  const targets = Array.isArray(raw.targets)
    ? raw.targets.filter(
        (t): t is CueTarget =>
          t != null &&
          typeof t === 'object' &&
          ((t as CueTarget).type === 'group' || (t as CueTarget).type === 'fixture') &&
          typeof (t as CueTarget).key === 'string',
      )
    : []
  return { targets, families: parseFamilies(raw.families) }
}

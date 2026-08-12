import { useSyncExternalStore } from 'react'

/**
 * The fixtures the last Include pulled in, published for the programmer sheet to select —
 * MagicQ's "Select Heads on Include". A small detail with outsized workflow impact: you
 * Include a cue and can immediately fan, locate or edit exactly its heads.
 *
 * ## Why a module-level store rather than a prop
 *
 * List selection is component-local `useState` inside `FixturesListContainer`, and the
 * programmer sheet is mounted in two places — the `/programmer` route and the Program view's
 * embedded pane. A Record/Include control in either place has no prop path to the other's
 * container, and lifting all of selection into Redux would mean rewriting the keyboard and
 * range machinery that depends on `useListSelection`'s referential stability.
 *
 * So this publishes only the *request*: "select these keys". Containers opt in
 * (`respondToIncludeSelection`), so the plain Fixtures and Groups lists are unaffected.
 *
 * [nonce] rather than comparing the key arrays: including the same cue twice is a legitimate
 * gesture and must re-select, and the operator may have changed the selection in between.
 */
export interface IncludeSelectionRequest {
  fixtureKeys: readonly string[]
  groupKeys: readonly string[]
  nonce: number
}

const EMPTY: IncludeSelectionRequest = { fixtureKeys: [], groupKeys: [], nonce: 0 }

let current: IncludeSelectionRequest = EMPTY
let nextNonce = 1
const listeners = new Set<() => void>()

/** Ask every mounted programmer sheet to select these fixtures. */
export function publishIncludeSelection(
  fixtureKeys: readonly string[],
  groupKeys: readonly string[] = [],
): void {
  if (fixtureKeys.length === 0 && groupKeys.length === 0) return
  current = { fixtureKeys, groupKeys, nonce: nextNonce++ }
  listeners.forEach((fn) => fn())
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

function getSnapshot(): IncludeSelectionRequest {
  return current
}

export function useIncludeSelectionRequest(): IncludeSelectionRequest {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

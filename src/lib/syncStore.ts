/**
 * A module-level, localStorage-backed value that every reader sees the same version of.
 *
 * `usePersistentState` deliberately does not do this: it reads its key once in a `useState`
 * initialiser and never listens for changes, so two components sharing a key hold two snapshots and
 * drift apart the moment one of them writes. That is fine for a preference with one mounted owner
 * and wrong for one with two — which is how the programmer's fade time came to reach the picker but
 * not the ShowBar's Blind, and why the stage vis source became a store before it.
 *
 * The shape is the `useSyncExternalStore` contract plus a persisted read: the value is parsed
 * lazily on first read, written back JSON-encoded on every set, and every storage access is
 * wrapped — `localStorage` throws on quota exhaustion and in some private-browsing modes, and a UI
 * preference is never worth taking the app down for.
 *
 * `parse` narrows rather than casts, because a value written by a later build (or junk typed into
 * devtools) must not reach code that has no case for it. It receives the already-`JSON.parse`d
 * value and returns the fallback for anything it doesn't recognise.
 *
 * Each caller declares its own `use…` hook over `subscribe` / `getSnapshot` — the factory can't,
 * because a hook has to be named for the linter to check it as one.
 */
export interface SyncStore<T> {
  /** `useSyncExternalStore`'s first argument. */
  subscribe: (onStoreChange: () => void) => () => void
  /** The current value, read from storage on first call and cached after. */
  getSnapshot: () => T
  /** `useSyncExternalStore`'s server snapshot — always the fallback. */
  getServerSnapshot: () => T
  /** Store a new value and re-render every reader. A no-op when it hasn't changed. */
  set: (next: T) => void
  /** Test seam: drop the cached value and any listeners so each test starts clean. */
  reset: () => void
}

export function createSyncStore<T>({
  key,
  fallback,
  parse,
}: {
  key: string
  fallback: T
  /** Narrow the parsed JSON, returning the fallback for anything unrecognised. */
  parse: (parsed: unknown) => T
}): SyncStore<T> {
  let current: T | null = null
  const listeners = new Set<() => void>()

  function readStored(): T {
    if (typeof window === 'undefined') return fallback
    try {
      const raw = window.localStorage.getItem(key)
      if (raw == null) return fallback
      return parse(JSON.parse(raw))
    } catch {
      // Absent, unparseable, or written by an incompatible build.
      return fallback
    }
  }

  function getSnapshot(): T {
    current ??= readStored()
    return current
  }

  return {
    subscribe(onStoreChange) {
      listeners.add(onStoreChange)
      return () => listeners.delete(onStoreChange)
    },
    getSnapshot,
    getServerSnapshot: () => fallback,
    set(next) {
      if (getSnapshot() === next) return
      current = next
      try {
        window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Quota exhausted or storage unavailable — the in-memory value still works.
      }
      listeners.forEach((fn) => fn())
    },
    reset() {
      current = null
      listeners.clear()
    },
  }
}

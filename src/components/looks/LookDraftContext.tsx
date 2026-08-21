import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { DEFERRED_TARGET_TYPE, type LookRow } from '@/api/looksApi'

/**
 * Draft state for a Look's **deferred** rows, scoped to the LookEditor subtree.
 *
 * Keyed by property name alone, with no fixture key anywhere — and that is exactly right for a
 * deferred row, which names no target and takes one from the layer applying it. It is exactly
 * wrong for a *bound* row, which is why the bound half of the library has no value grid at all and
 * is edited on stage instead. Hand this provider only the deferred rows; the editor round-trips
 * bound ones untouched.
 *
 * Kept separate from `EditorContext` so that fine-grained draft churn (every slider drag
 * emits a write) doesn't thrash consumers of the kind-discriminator. The store is a tiny
 * external store with its own subscribe/getSnapshot pair: components subscribe to the
 * single property they care about via `useLookDraftValue(propertyName)` and only rerender
 * when that property's value changes.
 *
 * Values are stored in the cue-side canonical form (hex for colour, `"pan,tilt"` for
 * position, `"0".."255"` for slider/setting). Writers canonicalise on their way in; readers
 * parse on their way out.
 */
export interface LookDraftContextValue {
  /** Read the current canonical value for `propertyName`, or undefined if unassigned. */
  getValue: (propertyName: string) => string | undefined
  /** Subscribe to changes to a single property. */
  subscribe: (propertyName: string, listener: () => void) => () => void
  /** Upsert a deferred row for this property. */
  onSetProperty: (propertyName: string, value: string) => void
  /** Remove the row entirely (stage output reverts to the layer below). */
  onClearProperty: (propertyName: string) => void
}

const LookDraftContext = createContext<LookDraftContextValue | null>(null)

interface LookDraftProviderProps {
  assignments: LookRow[]
  onChange: (next: LookRow[]) => void
  children: ReactNode
}

/**
 * Owns the draft row collection for a Look editor session. Synchronises its local indexed map
 * with the parent's array-shaped state so Save can ship a single `LookRow[]` over the wire.
 */
export function LookDraftProvider({
  assignments,
  onChange,
  children,
}: LookDraftProviderProps) {
  // Per-property listeners — granular so a slider drag on `dimmer` doesn't rerender the
  // colour swatch subscribed to `rgbColour`.
  const listenersRef = useRef<Map<string, Set<() => void>>>(new Map())

  // Index for O(1) reads. Rebuilt only when the `assignments` prop identity changes from
  // outside (open / save-reload) — not when `onSetProperty` writes round-trip through
  // parent state, because the writer has already kept the index in sync.
  const indexRef = useRef<Map<string, string>>(new Map())
  // Shadow of the parent's array, kept in a ref so the write callbacks can see the
  // latest without re-subscribing every consumer on each write.
  const assignmentsRef = useRef<LookRow[]>(assignments)
  const lastAssignmentsRef = useRef<LookRow[] | null>(null)
  if (lastAssignmentsRef.current !== assignments) {
    const next = new Map<string, string>()
    for (const a of assignments) next.set(a.propertyName, a.value)
    indexRef.current = next
    assignmentsRef.current = assignments
    lastAssignmentsRef.current = assignments
  }

  const notify = useCallback((propertyName: string) => {
    const listeners = listenersRef.current.get(propertyName)
    if (!listeners) return
    for (const l of listeners) l()
  }, [])

  const getValue = useCallback((propertyName: string) => {
    return indexRef.current.get(propertyName)
  }, [])

  const subscribe = useCallback((propertyName: string, listener: () => void) => {
    let set = listenersRef.current.get(propertyName)
    if (!set) {
      set = new Set()
      listenersRef.current.set(propertyName, set)
    }
    set.add(listener)
    return () => {
      set!.delete(listener)
      if (set!.size === 0) listenersRef.current.delete(propertyName)
    }
  }, [])

  // Stash `onChange` in a ref so the write callbacks stay referentially stable across
  // renders. Without this, every keystroke re-renders LookDraftProvider with a new
  // `assignments` prop, which would churn the memoised context value and force every
  // subscriber's `useSyncExternalStore` to unsubscribe+resubscribe.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const onSetProperty = useCallback(
    (propertyName: string, value: string) => {
      const current = indexRef.current.get(propertyName)
      if (current === value) return
      indexRef.current.set(propertyName, value)
      const prev = assignmentsRef.current
      const existingIndex = prev.findIndex((a) => a.propertyName === propertyName)
      const next =
        existingIndex >= 0
          ? prev.map((a, i) => (i === existingIndex ? { ...a, value } : a))
          : [
              ...prev,
              {
                // A row authored here is always deferred: the editor works against a *synthetic*
                // fixture built from `editorFixtureType`, so there is no real target to name.
                targetType: DEFERRED_TARGET_TYPE,
                targetKey: '',
                propertyName,
                value,
                fadeDurationMs: null,
                sortOrder: prev.length,
              },
            ]
      assignmentsRef.current = next
      onChangeRef.current(next)
      notify(propertyName)
    },
    [notify],
  )

  const onClearProperty = useCallback(
    (propertyName: string) => {
      if (!indexRef.current.has(propertyName)) return
      indexRef.current.delete(propertyName)
      const next = assignmentsRef.current.filter((a) => a.propertyName !== propertyName)
      assignmentsRef.current = next
      onChangeRef.current(next)
      notify(propertyName)
    },
    [notify],
  )

  const value = useMemo<LookDraftContextValue>(
    () => ({ getValue, subscribe, onSetProperty, onClearProperty }),
    [getValue, subscribe, onSetProperty, onClearProperty],
  )

  return (
    <LookDraftContext.Provider value={value}>{children}</LookDraftContext.Provider>
  )
}

export function useLookDraft(): LookDraftContextValue | null {
  return useContext(LookDraftContext)
}

/**
 * Subscribe a single property to the draft store. Returns the current canonical value
 * string, or undefined if not assigned. Safe to call outside a provider — returns undefined.
 */
export function useLookDraftValue(propertyName: string): string | undefined {
  const ctx = useContext(LookDraftContext)
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!ctx) return () => {}
      return ctx.subscribe(propertyName, listener)
    },
    [ctx, propertyName],
  )
  const getSnapshot = useCallback(() => {
    if (!ctx) return undefined
    return ctx.getValue(propertyName)
  }, [ctx, propertyName])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { FxPresetPropertyAssignment } from '@/api/fxPresetsApi'

/**
 * Draft state for a preset's property assignments, scoped to the PresetEditor subtree.
 *
 * Kept separate from `EditorContext` so that fine-grained draft churn (every slider drag
 * emits a write) doesn't thrash consumers of the kind-discriminator. The store is a tiny
 * external store with its own subscribe/getSnapshot pair: components subscribe to the
 * single property they care about via `usePresetDraftValue(propertyName)` and only rerender
 * when that property's value changes.
 *
 * Values are stored in the cue-side canonical form (hex for colour, `"pan,tilt"` for
 * position, `"0".."255"` for slider/setting). Writers canonicalise on their way in; readers
 * parse on their way out.
 */
export interface PresetDraftContextValue {
  /** Read the current canonical value for `propertyName`, or undefined if unassigned. */
  getValue: (propertyName: string) => string | undefined
  /** Subscribe to changes to a single property. */
  subscribe: (propertyName: string, listener: () => void) => () => void
  /** Upsert a property assignment. */
  onSetProperty: (propertyName: string, value: string) => void
  /** Remove a property assignment entirely (stage output reverts to layer below). */
  onClearProperty: (propertyName: string) => void
}

const PresetDraftContext = createContext<PresetDraftContextValue | null>(null)

interface PresetDraftProviderProps {
  assignments: FxPresetPropertyAssignment[]
  onChange: (next: FxPresetPropertyAssignment[]) => void
  children: ReactNode
}

/**
 * Owns the draft property-assignment collection for a preset editor session. Synchronises
 * its local indexed map with the parent's array-shaped state so Save can ship a single
 * `FxPresetPropertyAssignment[]` over the wire.
 */
export function PresetDraftProvider({
  assignments,
  onChange,
  children,
}: PresetDraftProviderProps) {
  // Per-property listeners — granular so a slider drag on `dimmer` doesn't rerender the
  // colour swatch subscribed to `rgbColour`.
  const listenersRef = useRef<Map<string, Set<() => void>>>(new Map())

  // Index for O(1) reads. Rebuilt only when the `assignments` prop identity changes from
  // outside (open / save-reload) — not when `onSetProperty` writes round-trip through
  // parent state, because the writer has already kept the index in sync.
  const indexRef = useRef<Map<string, string>>(new Map())
  // Shadow of the parent's array, kept in a ref so the write callbacks can see the
  // latest without re-subscribing every consumer on each write.
  const assignmentsRef = useRef<FxPresetPropertyAssignment[]>(assignments)
  const lastAssignmentsRef = useRef<FxPresetPropertyAssignment[] | null>(null)
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
  // renders. Without this, every keystroke re-renders PresetDraftProvider with a new
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
          : [...prev, { propertyName, value, fadeDurationMs: null, sortOrder: prev.length }]
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

  const value = useMemo<PresetDraftContextValue>(
    () => ({ getValue, subscribe, onSetProperty, onClearProperty }),
    [getValue, subscribe, onSetProperty, onClearProperty],
  )

  return (
    <PresetDraftContext.Provider value={value}>{children}</PresetDraftContext.Provider>
  )
}

export function usePresetDraft(): PresetDraftContextValue | null {
  return useContext(PresetDraftContext)
}

/**
 * Subscribe a single property to the draft store. Returns the current canonical value
 * string, or undefined if not assigned. Safe to call outside a provider — returns undefined.
 */
export function usePresetDraftValue(propertyName: string): string | undefined {
  const ctx = useContext(PresetDraftContext)
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

import { useSyncExternalStore } from 'react'

/**
 * Which layer of the lighting cascade the stage views should draw.
 *
 * A module-level store rather than `usePersistentState`, because two surfaces read it: the Stage
 * route's view menu and the globally-mounted stage overview panel. `usePersistentState` reads its
 * key once in a `useState` initialiser and never listens for changes, so two components sharing a
 * key would drift apart the moment one of them wrote. Same shape as the programmer revision store
 * in `store/programmer.ts`.
 */
export type VisSource = 'output' | 'outputProgrammer' | 'programmer' | 'nextGo'

export const VIS_SOURCES: readonly VisSource[] = [
  'output',
  'outputProgrammer',
  'programmer',
  'nextGo',
]

export const DEFAULT_VIS_SOURCE: VisSource = 'output'

export const VIS_SOURCE_LABELS: Record<VisSource, string> = {
  output: 'Output',
  outputProgrammer: 'Output + Programmer',
  programmer: 'Programmer only',
  nextGo: 'Next GO',
}

export const VIS_SOURCE_HINTS: Record<VisSource, string> = {
  output: 'Final merged DMX — what the desk is transmitting.',
  // Worth spelling out: outside blind the programmer is already part of the merge, so this
  // setting looks broken unless the operator knows when it bites.
  outputProgrammer: 'Output with the programmer laid over it. Same as Output unless Blind is on.',
  programmer: 'Only what the programmer holds. Everything else reads zero.',
  // "Cue values only" is the caveat an operator would otherwise read as a bug: a cue whose look
  // is carried by an effect previews as nothing. The other one — nothing is previewed at all
  // unless the show is running — is live state, so it comes from `useNextGoStatus` instead.
  nextGo: 'What the next GO would look like, over live output. Cue values only.',
}

const STORAGE_KEY = 'stageVisSource'

export function isVisSource(value: unknown): value is VisSource {
  return typeof value === 'string' && (VIS_SOURCES as readonly string[]).includes(value)
}

function readStored(): VisSource {
  if (typeof window === 'undefined') return DEFAULT_VIS_SOURCE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw == null) return DEFAULT_VIS_SOURCE
    // Narrowed rather than cast: a value written by a later build (or junk) must not become a
    // `VisSource` the switch below has no case for.
    const parsed: unknown = JSON.parse(raw)
    return isVisSource(parsed) ? parsed : DEFAULT_VIS_SOURCE
  } catch {
    // Absent, unparseable, or written by an incompatible build.
    return DEFAULT_VIS_SOURCE
  }
}

let current: VisSource | null = null
const listeners = new Set<() => void>()

function getSnapshot(): VisSource {
  current ??= readStored()
  return current
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => listeners.delete(onStoreChange)
}

/** The current vis source, re-rendering every reader when it changes. */
export function useVisSource(): VisSource {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_VIS_SOURCE)
}

export function setVisSource(next: VisSource) {
  if (getSnapshot() === next) return
  current = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota exhausted or storage unavailable — the in-memory value still works.
  }
  listeners.forEach((fn) => fn())
}

/** Test seam: drop the cached value and any listeners so each test starts clean. */
export function resetVisSourceStore() {
  current = null
  listeners.clear()
}

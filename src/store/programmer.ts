import { useSyncExternalStore } from 'react'
import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import type { IncludedTarget, ProgrammerTargetType } from '../api/programmerWsApi'

export type {
  IncludedTarget,
  ProgrammerEntry,
  ProgrammerKeyState,
  ProgrammerState,
  ProgrammerTargetType,
  ProvenanceEntry,
  ProvenanceSource,
} from '../api/programmerWsApi'
export { programmerKey } from '../api/programmerWsApi'

/**
 * Coarse programmer state for the always-visible indicator and the toolbar.
 *
 * Deliberately *just* the counters and the blind flag rather than the whole entry map:
 * this cache entry re-renders every consumer on each change, and the sheet's cells read
 * their own state through `lightingApi.programmer.subscribeToKey` instead. Mirrors how
 * `channels.ts` keeps per-channel queries separate from the whole-map subscription.
 */
export interface ProgrammerSummary {
  blind: boolean
  entryCount: number
  /**
   * Entries holding a palette reference rather than a literal. Gates Make Hard, which is
   * meaningless — and would read as broken — when the programmer holds none.
   */
  referenceCount: number
  /** What Include last loaded — drives the Update button's target and label. */
  lastIncluded: IncludedTarget | null
}

function countReferences(entries: Iterable<{ paletteUuid?: string }>): number {
  let count = 0
  for (const entry of entries) {
    if (entry.paletteUuid) count += 1
  }
  return count
}

function currentSummary(): ProgrammerSummary {
  const state = lightingApi.programmer.getState()
  return {
    blind: state.blind,
    entryCount: state.entries.size,
    referenceCount: countReferences(state.entries.values()),
    lastIncluded: state.lastIncluded,
  }
}

export const programmerApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    programmerSummary: build.query<ProgrammerSummary, void>({
      queryFn: () => ({ data: currentSummary() }),
      async onCacheEntryAdded(_, { updateCachedData, cacheEntryRemoved }) {
        const subscription = lightingApi.programmer.subscribe((state) => {
          updateCachedData((draft) => {
            // Assign fields rather than replacing the object: RTK Query's Immer draft
            // only notices structural writes, and this keeps the identity stable when
            // neither counter moved (a provenance-only push).
            draft.blind = state.blind
            draft.entryCount = state.entries.size
            draft.referenceCount = countReferences(state.entries.values())
            draft.lastIncluded = state.lastIncluded
          })
        })
        await cacheEntryRemoved
        subscription.unsubscribe()
      },
    }),
  }),
  overrideExisting: false,
})

export const { useProgrammerSummaryQuery } = programmerApi

/**
 * Re-render on *any* programmer change, including a value edit that leaves the entry count
 * untouched. [useProgrammerSummaryQuery] deliberately only tracks the counters, so a view
 * that reads entry *values* through `lightingApi.programmer.getKeyState` needs this to know
 * when to look again.
 *
 * A blunt instrument by design — it is for small surfaces like the busking pad. The
 * programmer sheet subscribes per (target, property) instead, because waking every cell on
 * every layer event is exactly what that split exists to avoid.
 */
export function useProgrammerRevision(): number {
  return useSyncExternalStore(subscribeToProgrammer, getProgrammerRevision)
}

let revision = 0
const revisionListeners = new Set<() => void>()
let revisionSubscription: { unsubscribe: () => void } | null = null

function subscribeToProgrammer(onStoreChange: () => void): () => void {
  revisionListeners.add(onStoreChange)
  revisionSubscription ??= lightingApi.programmer.subscribe(() => {
    revision += 1
    revisionListeners.forEach((fn) => fn())
  })
  return () => {
    revisionListeners.delete(onStoreChange)
    if (revisionListeners.size === 0) {
      revisionSubscription?.unsubscribe()
      revisionSubscription = null
    }
  }
}

function getProgrammerRevision(): number {
  return revision
}

// ── Imperative writers ──────────────────────────────────────────────────────
// Plain functions, not mutations: these are fire-and-forget WS ops on the busking hot path
// (a slider drag emits them at input rate), and an RTK Query mutation per frame would both
// churn the cache and light up the save-status indicator. Same rationale as `fx.ts`.

export function programmerSet(
  targetType: ProgrammerTargetType,
  targetKey: string,
  propertyName: string,
  value: string,
  fadeMs?: number,
) {
  lightingApi.programmer.set(targetType, targetKey, propertyName, value, fadeMs)
}

export function programmerSetColour(
  targetType: ProgrammerTargetType,
  targetKey: string,
  propertyName: string,
  rgb: { r: number; g: number; b: number; w?: number; a?: number; uv?: number },
  fadeMs?: number,
) {
  lightingApi.programmer.setColour(targetType, targetKey, propertyName, rgb, fadeMs)
}

export function programmerSetPosition(
  targetType: ProgrammerTargetType,
  targetKey: string,
  pan: number,
  tilt: number,
  fadeMs?: number,
) {
  lightingApi.programmer.setPosition(targetType, targetKey, pan, tilt, fadeMs)
}

/** Releases **every** owner on the property — locate, presets and surface faders included. */
export function programmerClearEntry(
  targetType: ProgrammerTargetType,
  targetKey: string,
  propertyName: string,
  fadeMs?: number,
) {
  lightingApi.programmer.clearEntry(targetType, targetKey, propertyName, fadeMs)
}

export function programmerClearAll(fadeMs?: number) {
  lightingApi.programmer.clearAll(fadeMs)
}

export function programmerSetBlind(blind: boolean, fadeMs?: number) {
  lightingApi.programmer.setBlind(blind, fadeMs)
}

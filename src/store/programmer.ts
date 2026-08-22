import { useSyncExternalStore } from 'react'
import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import type { CueTarget } from '../api/cuesApi'
import type {
  IncludedTarget,
  ProgrammerLayer,
  ProgrammerTargetType,
} from '../api/programmerWsApi'

export type {
  IncludedTarget,
  ProgrammerEntry,
  ProgrammerKeyState,
  ProgrammerLayer,
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
  /** What Include last loaded — drives the Update button's target and label. */
  lastIncluded: IncludedTarget | null
}

function currentSummary(): ProgrammerSummary {
  const state = lightingApi.programmer.getState()
  return {
    blind: state.blind,
    entryCount: state.entries.size,
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
 * The programmer's Look-layer stack.
 *
 * A **separate** cache entry from [ProgrammerSummary] rather than a field on it, and the reason is
 * the summary's own: it is read by the always-visible `ProgrammerIndicator`, so folding the stack in
 * would re-render that on every layer event. This entry is subscribed only by the surfaces that
 * draw layers — the Program pane's Layers tab and the busking pads' active ring.
 */
export const programmerLayersApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    programmerLayers: build.query<ProgrammerLayer[], void>({
      queryFn: () => ({ data: [...lightingApi.programmer.layers()] }),
      async onCacheEntryAdded(_, { updateCachedData, cacheEntryRemoved }) {
        // `subscribe` fires on every provenance push too, so compare before writing: an
        // untouched stack must not wake the pads on each 50 Hz-adjacent layer event.
        let signature = layerSignature(lightingApi.programmer.layers())
        const subscription = lightingApi.programmer.subscribe((state) => {
          const next = layerSignature(state.layers)
          if (next === signature) return
          signature = next
          updateCachedData(() => [...state.layers])
        })
        await cacheEntryRemoved
        subscription.unsubscribe()
      },
    }),
  }),
  overrideExisting: false,
})

function layerSignature(layers: readonly ProgrammerLayer[]): string {
  return JSON.stringify(layers)
}

export const { useProgrammerLayersQuery } = programmerLayersApi

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

// ── Layer ops ───────────────────────────────────────────────────────────────
// Plain functions for the same reason as the writers above, plus one of their own: the server
// answers every one of these with the whole `programmer.layerState` broadcast, so there is no
// per-call reply for a mutation to await. `patchLayer` is also on a drag/typing path.

export function programmerAddLayer(input: {
  lookId: number
  targets?: CueTarget[]
  propertyMask?: string
  blendMode?: string
  amount?: number
  speedMasterUuid?: string
  rateSpeedMasterUuid?: string
  fadeMs?: number
}) {
  lightingApi.programmer.addLayer(input)
}

export function programmerRemoveLayer(layerId: number, fadeMs?: number) {
  lightingApi.programmer.removeLayer(layerId, fadeMs)
}

/** [toIndex] counts non-preview layers — the preview always sorts last, server-side. */
export function programmerMoveLayer(layerId: number, toIndex: number) {
  lightingApi.programmer.moveLayer(layerId, toIndex)
}

export function programmerPatchLayer(
  layerId: number,
  patch: {
    enabled?: boolean
    amount?: number
    propertyMask?: string
    blendMode?: string
    targets?: CueTarget[]
    stomp?: boolean
    fadeMs?: number
  },
) {
  lightingApi.programmer.patchLayer(layerId, patch)
}

import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import { store } from './index'
import type { BlendMode } from '../api/groupsApi'

// WebSocket subscription: invalidate fixture effects when any FX changes
lightingApi.fx.subscribe(() => {
  store.dispatch(restApi.util.invalidateTags(['FixtureEffects']))
})

// === Types ===

export interface FixtureDirectEffect {
  id: number
  effectType: string
  targetKey: string
  propertyName: string
  beatDivision: number
  blendMode: string
  isRunning: boolean
  phaseOffset: number
  currentPhase: number
  parameters: Record<string, string>
  isGroupTarget: false
  distributionStrategy: string | null
  elementFilter: string | null
  stepTiming: boolean
  presetId: number | null
  cueId: number | null
  /** Speed master this effect subscribes to (null → master 1). */
  speedMasterUuid?: string | null
  /** Wall-clock rate master (null → unscaled); only WALL_CLOCK effects read it. */
  rateSpeedMasterUuid?: string | null
}

export interface FixtureIndirectEffect {
  id: number
  effectType: string
  groupName: string
  propertyName: string
  beatDivision: number
  blendMode: string
  isRunning: boolean
  phaseOffset: number
  currentPhase: number
  parameters: Record<string, string>
  distributionStrategy: string
  stepTiming: boolean
  /** Speed master this effect subscribes to (null → master 1). */
  speedMasterUuid?: string | null
  /** Wall-clock rate master (null → unscaled); only WALL_CLOCK effects read it. */
  rateSpeedMasterUuid?: string | null
}

export interface FixtureEffects {
  direct: FixtureDirectEffect[]
  indirect: FixtureIndirectEffect[]
}

export interface EffectParameterDef {
  name: string
  type: string
  defaultValue: string
  description: string
}

export interface EffectLibraryEntry {
  name: string
  category: string
  outputType: string
  effectMode: string
  /**
   * `BEAT` (the default) or `WALL_CLOCK`. Decides which master picker is meaningful and how
   * the beat-division control is labelled — a wall-clock effect reads its division as cycle
   * *seconds* and never consults a speed master at all.
   */
  timingSource?: string
  description?: string
  parameters: EffectParameterDef[]
  compatibleProperties: string[]
  source?: string
  sourceDefinitionId?: number | null
  script?: string | null
}

/** Normalise an effect type name for lookup: lowercase, strip whitespace + underscores. */
function normaliseEffectName(name: string): string {
  return name.toLowerCase().replace(/[\s_]/g, '')
}

/**
 * Build a lookup that resolves `(effectType, category?)` → `EffectLibraryEntry`.
 * Names in the library aren't guaranteed unique across categories, so category-qualified
 * keys are preferred; falls back to the last entry wins if unqualified.
 */
export function buildEffectLibraryLookup(
  library: EffectLibraryEntry[] | undefined,
): (effectType: string, category?: string) => EffectLibraryEntry | undefined {
  const map = new Map<string, EffectLibraryEntry>()
  if (library) {
    for (const entry of library) {
      const n = normaliseEffectName(entry.name)
      map.set(`${entry.category}:${n}`, entry)
      map.set(n, entry)
    }
  }
  return (effectType, category) => {
    const n = normaliseEffectName(effectType)
    if (category) {
      const qualified = map.get(`${category}:${n}`)
      if (qualified) return qualified
    }
    return map.get(n)
  }
}

export interface AddFixtureFxRequest {
  effectType: string
  fixtureKey: string
  propertyName: string
  beatDivision: number
  blendMode: BlendMode
  startOnBeat: boolean
  phaseOffset: number
  parameters: Record<string, string>
  distributionStrategy?: string
  elementFilter?: string
  stepTiming?: boolean
  /** Speed master to subscribe to, as the master's uuid (omitted → master 1). */
  speedMasterUuid?: string
  /**
   * Wall-clock rate master, as the master's uuid (omitted → unscaled). Read only by
   * WALL_CLOCK effects; it sits alongside `speedMasterUuid` rather than replacing it.
   */
  rateSpeedMasterUuid?: string
  /**
   * Create the effect in the programmer's reserved priority band, so it composes *on top of*
   * programmer values instead of being suppressed by them, and Clear sweeps it with them.
   * Set by the busking pad; cue and script authoring leave it off.
   */
  programmerOwned?: boolean
}

/**
 * One running effect, as `GET /api/rest/fx/active` reports it. Richer than the `fxState`
 * WebSocket frame, which carries no `propertyName` or group flag — both of which the FX
 * sheet needs to place a chip in the right fixture x column.
 */
export interface ActiveEffect {
  id: number
  effectType: string
  targetKey: string
  propertyName: string
  beatDivision: number
  blendMode: string
  isRunning: boolean
  phaseOffset: number
  currentPhase: number
  parameters: Record<string, string>
  isGroupTarget: boolean
  distributionStrategy: string | null
  elementMode: string | null
  elementFilter: string | null
  stepTiming: boolean
  presetId: number | null
  cueId: number | null
  timingSource: string
  /** True when the effect sits in the programmer's priority band. */
  programmerOwned: boolean
  /** Fade envelope in [0, 1]; the effect's output is scaled by this before blending. */
  intensityMultiplier: number
  /** Speed master this effect subscribes to (null → master 1). */
  speedMasterUuid: string | null
  /** Wall-clock rate master (null → unscaled); only WALL_CLOCK effects read it. */
  rateSpeedMasterUuid: string | null
}

export interface UpdateFxRequest {
  effectType?: string
  parameters?: Record<string, string>
  beatDivision?: number
  blendMode?: string
  phaseOffset?: number
  distributionStrategy?: string
  elementFilter?: string
  stepTiming?: boolean
  /**
   * Reassign the effect's speed master (omitted = no change, like every other field). The
   * picker always sends a concrete uuid — master 1's uuid means "back to the default".
   */
  speedMasterUuid?: string
  /** Reassign the wall-clock rate master; omitted = no change, as above. */
  rateSpeedMasterUuid?: string
}

// === RTK Query Endpoints ===

export const fixtureFxApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    fixtureEffects: build.query<FixtureEffects, string>({
      query: (fixtureKey) => `fx/fixture/${encodeURIComponent(fixtureKey)}`,
      providesTags: (_result, _error, fixtureKey) => [
        { type: 'FixtureEffects', id: fixtureKey },
      ],
    }),

    /** Every running effect, rig-wide. Invalidated by the `fxChanged` subscription above. */
    activeEffects: build.query<ActiveEffect[], void>({
      query: () => 'fx/active',
      providesTags: ['FixtureEffects'],
    }),

    effectLibrary: build.query<EffectLibraryEntry[], void>({
      query: () => 'fx/library',
      providesTags: ['FxLibrary'],
    }),

    addFixtureFx: build.mutation<{ effectId: number }, AddFixtureFxRequest>({
      query: (request) => ({
        url: 'fx/add',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: (_result, _error, { fixtureKey }) => [
        { type: 'FixtureEffects', id: fixtureKey },
      ],
    }),

    updateFx: build.mutation<void, { id: number; fixtureKey: string; body: UpdateFxRequest }>({
      query: ({ id, body }) => ({
        url: `fx/${id}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, { fixtureKey }) => [
        { type: 'FixtureEffects', id: fixtureKey },
      ],
    }),

    removeFx: build.mutation<void, { id: number; fixtureKey: string }>({
      query: ({ id }) => ({
        url: `fx/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { fixtureKey }) => [
        { type: 'FixtureEffects', id: fixtureKey },
      ],
    }),

    pauseFx: build.mutation<void, { id: number; fixtureKey: string }>({
      query: ({ id }) => ({
        url: `fx/${id}/pause`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, { fixtureKey }) => [
        { type: 'FixtureEffects', id: fixtureKey },
      ],
    }),

    resumeFx: build.mutation<void, { id: number; fixtureKey: string }>({
      query: ({ id }) => ({
        url: `fx/${id}/resume`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, { fixtureKey }) => [
        { type: 'FixtureEffects', id: fixtureKey },
      ],
    }),
  }),
  overrideExisting: false,
})

export const {
  useFixtureEffectsQuery,
  useActiveEffectsQuery,
  useEffectLibraryQuery,
  useAddFixtureFxMutation,
  useUpdateFxMutation,
  useRemoveFxMutation,
  usePauseFxMutation,
  useResumeFxMutation,
} = fixtureFxApi

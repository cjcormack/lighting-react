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
  description: string
  parameters: EffectParameterDef[]
  compatibleProperties: string[]
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

    effectLibrary: build.query<EffectLibraryEntry[], void>({
      query: () => 'fx/library',
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
  useEffectLibraryQuery,
  useAddFixtureFxMutation,
  useUpdateFxMutation,
  useRemoveFxMutation,
  usePauseFxMutation,
  useResumeFxMutation,
} = fixtureFxApi

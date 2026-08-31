import { restApi } from './restApi'
import type { EffectParameterDef } from './fixtureFx'

// === Types ===

export interface FxDefinition {
  id: number
  effectId: string
  name: string
  category: string
  outputType: string
  effectMode: string
  parameters: EffectParameterDef[]
  compatibleProperties: string[]
  script: string
  defaultStepTiming: boolean
  timingSource?: 'BEAT' | 'WALL_CLOCK'
}

export interface CreateFxDefinitionRequest {
  effectId: string
  name: string
  category: string
  outputType?: string
  effectMode?: string
  parameters?: EffectParameterDef[]
  compatibleProperties?: string[]
  script: string
  defaultStepTiming?: boolean
  timingSource?: string
}

export interface UpdateFxDefinitionRequest {
  effectId?: string
  name?: string
  category?: string
  outputType?: string
  effectMode?: string
  parameters?: EffectParameterDef[]
  compatibleProperties?: string[]
  script?: string
  defaultStepTiming?: boolean
  timingSource?: string
}

// === RTK Query Endpoints ===

export const fxDefinitionsApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    // The definition *list* is not read here: every consumer wants the whole effect
    // vocabulary, built-ins included, which is `effectLibrary` in `store/fixtureFx.ts`. That
    // query carries the `FxLibrary` tag the `fxDefinitionListChanged` bridge invalidates.

    fxDefinition: build.query<FxDefinition, number>({
      query: (id) => `fx/definitions/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'FxLibrary', id }],
    }),

    createFxDefinition: build.mutation<FxDefinition, CreateFxDefinitionRequest>({
      query: (body) => ({
        url: 'fx/definitions',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['FxLibrary'],
    }),

    updateFxDefinition: build.mutation<FxDefinition, { id: number } & UpdateFxDefinitionRequest>({
      query: ({ id, ...body }) => ({
        url: `fx/definitions/${id}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['FxLibrary'],
    }),

    deleteFxDefinition: build.mutation<void, number>({
      query: (id) => ({
        url: `fx/definitions/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['FxLibrary'],
    }),

    // The three FX-definition compile/test mutations stood here. `routes/FxLibrary.tsx` compiles
    // through `compileProjectScript` instead — one dialog and one code path for every script
    // type, the effect editor included — so none of them was ever fired.
  }),
  overrideExisting: false,
})

export const {
  useFxDefinitionQuery,
  useCreateFxDefinitionMutation,
  useUpdateFxDefinitionMutation,
  useDeleteFxDefinitionMutation,
} = fxDefinitionsApi

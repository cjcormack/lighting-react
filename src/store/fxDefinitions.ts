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
  isBuiltin: boolean
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

export interface CompileFxDefinitionRequest {
  script: string
  effectMode?: string
}

export interface FxCompileResponse {
  success: boolean
  messages: FxCompileMessage[]
}

export interface FxCompileMessage {
  severity: string
  message: string
  location?: string | null
}

// === RTK Query Endpoints ===

export const fxDefinitionsApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    fxDefinitions: build.query<FxDefinition[], void>({
      query: () => 'fx/definitions',
      providesTags: ['FxLibrary'],
    }),

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

    compileFxScript: build.mutation<FxCompileResponse, CompileFxDefinitionRequest>({
      query: (body) => ({
        url: 'fx/definitions/compile',
        method: 'POST',
        body,
      }),
    }),

    compileFxDefinition: build.mutation<FxCompileResponse, { id: number } & CompileFxDefinitionRequest>({
      query: ({ id, ...body }) => ({
        url: `fx/definitions/${id}/compile`,
        method: 'POST',
        body,
      }),
    }),

    testFxDefinition: build.mutation<FxCompileResponse, number>({
      query: (id) => ({
        url: `fx/definitions/${id}/test`,
        method: 'POST',
      }),
      invalidatesTags: ['FxLibrary'],
    }),
  }),
  overrideExisting: false,
})

export const {
  useFxDefinitionsQuery,
  useFxDefinitionQuery,
  useCreateFxDefinitionMutation,
  useUpdateFxDefinitionMutation,
  useDeleteFxDefinitionMutation,
  useCompileFxScriptMutation,
  useCompileFxDefinitionMutation,
  useTestFxDefinitionMutation,
} = fxDefinitionsApi

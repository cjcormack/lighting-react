import { restApi } from "./restApi"

export const scriptsApi = restApi.injectEndpoints({
  endpoints: (build) => {
    return {
      scriptList: build.query<Array<Script>, void>({
        query: () => {
          return 'script/list'
        },
        providesTags: ['Script'],
      }),
      script: build.query<Script, number>({
        query: (id) => {
          return `script/${id}`
        },
        providesTags: ['Script'],
      }),
      compileScript: build.mutation<CompileResult, CompileRequest>({
        query: (request) => ({
          url: 'script/compile',
          method: 'POST',
          body: request,
        }),
      }),
      runScript: build.mutation<RunResult, RunRequest>({
        query: (request) => ({
          url: 'script/run',
          method: 'POST',
          body: request,
        }),
      }),
      saveScript: build.mutation<Script, Partial<Script> & Pick<Script, 'id'>>({
        query: ({ id, ...request }) => ({
          url: `script/${id}`,
          method: 'PUT',
          body: request,
        }),
        invalidatesTags: ['Script'],
      }),
      deleteScript: build.mutation<void, number>({
        query: (id) => ({
          url: `script/${id}`,
          method: 'DELETE',
        }),
        invalidatesTags: ['Script'],
      }),
      createScript: build.mutation<Script, ScriptDetails>({
        query: (script) => ({
          url: `script`,
          method: 'POST',
          body: script,
        }),
        invalidatesTags: ['Script'],
      }),
    }
  },
  overrideExisting: false,
})

export const {
  useScriptListQuery, useScriptQuery, useRunScriptMutation, useCompileScriptMutation,
  useSaveScriptMutation, useDeleteScriptMutation, useCreateScriptMutation
} = scriptsApi

export type Script = ScriptDetails & {
  id: number
}

export type ScriptDetails = {
  name: string
  script: string
  settings: ScriptSetting[]
}

export type ScriptSetting = {
  type: 'scriptSettingInt'
  name: string
  minValue?: number
  maxValue?: number
  defaultValue?: number
}

export type CompileResultMessage = {
  severity: 'INFO'|'WARNING'|'ERROR'
  message: string
  sourcePath?: string
  location?: string
}

export type CompileRequest = {
  script: string
  settings?: ScriptSetting[]
}

export type CompileResult = {
  success: boolean
  messages: CompileResultMessage[]
}

export type RunRequest = CompileRequest

export type RunResult = {
  status: 'success'|'compileError'|'exception'
  messages: CompileResultMessage[]
  result?: string
}

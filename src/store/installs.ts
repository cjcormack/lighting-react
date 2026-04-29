import { restApi } from "./restApi"

export interface Install {
  uuid: string
  friendlyName: string
  createdAtMs: number
}

export interface UpdateInstallRequest {
  friendlyName: string
}

export const installsApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    install: build.query<Install, void>({
      query: () => 'install',
      providesTags: ['Install'],
    }),
    updateInstall: build.mutation<Install, UpdateInstallRequest>({
      query: (body) => ({
        url: 'install',
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['Install'],
    }),
  }),
  overrideExisting: false,
})

export const {
  useInstallQuery,
  useUpdateInstallMutation,
} = installsApi

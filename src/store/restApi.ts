import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

export const restApi = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: '/api/rest' }),
  tagTypes: ['Script'],
  endpoints: () => ({}),
})

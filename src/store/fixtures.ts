import { restApi } from "./restApi"
import { lightingApi } from "../api/lightingApi"
import { store } from "./index"

lightingApi.fixtures.subscribe(function() {
  store.dispatch(restApi.util.invalidateTags(['Fixture']))
})

export const fixturesApi = restApi.injectEndpoints({
  endpoints: (build) => {
    return {
      fixtureList: build.query<Array<Fixture>, void>({
        query: () => {
          return 'fixture/list'
        },
        providesTags: ['Fixture'],
      }),
      fixture: build.query<Fixture, number>({
        query: (id) => {
          return `fixture/${id}`
        },
        providesTags: ['Fixture'],
      }),
    }
  },
  overrideExisting: false,
})

export const {
  useFixtureListQuery, useFixtureQuery
} = fixturesApi

export type Fixture = {
  key: string
  name: string
  typeKey: string
  universe: number
  channels: {
    channelNo: number
    description: string
  }[]
}

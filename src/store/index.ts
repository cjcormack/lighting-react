import { configureStore } from '@reduxjs/toolkit'
import {restApi} from "./restApi";
import { setupListeners } from "@reduxjs/toolkit/query"

export const store = configureStore({
  reducer: {
    [restApi.reducerPath]: restApi.reducer,
  },

  middleware: (getDefaultMiddleware) => {
    return getDefaultMiddleware({
      serializableCheck: {
        // Ignore RTK Query internal paths - contains subscription functions
        ignoredPaths: ['restApi.queries', 'restApi.mutations', 'restApi.subscriptions'],
      },
      immutableCheck: {
        // Ignore RTK Query internal paths - large state with many cache entries
        ignoredPaths: ['restApi.queries', 'restApi.mutations', 'restApi.subscriptions'],
      },
    }).concat(restApi.middleware)
  }
})

setupListeners(store.dispatch)

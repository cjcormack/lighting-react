import { configureStore } from '@reduxjs/toolkit'
import {restApi} from "./restApi";
import { setupListeners } from "@reduxjs/toolkit/query"
import { runnerSlice } from './runnerSlice'
import { errorToastMiddleware } from './errorToastMiddleware'
import { saveStatusSlice } from './saveStatusSlice'
import { selectionSlice } from './selectionSlice'

export const store = configureStore({
  reducer: {
    [restApi.reducerPath]: restApi.reducer,
    runner: runnerSlice.reducer,
    // Matches on RTK Query's mutation lifecycle actions — see saveStatusSlice.
    saveStatus: saveStatusSlice.reducer,
    // Fixtures-list row selection, keyed by list. In the store so surfaces outside the list
    // (RecordSheet's "selected fixtures only") can read it — see selectionSlice.
    selection: selectionSlice.reducer,
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
      // Runs after restApi.middleware so it sees the rejected endpoint actions RTK Query
      // dispatches. Any mutation failure not claimed by its call site becomes a toast.
    }).concat(restApi.middleware, errorToastMiddleware)
  }
})

setupListeners(store.dispatch)

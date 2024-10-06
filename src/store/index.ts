import { configureStore } from '@reduxjs/toolkit'
import {restApi} from "./restApi";
import { setupListeners } from "@reduxjs/toolkit/query"

export const store = configureStore({
  reducer: {
    [restApi.reducerPath]: restApi.reducer,
  },

  middleware: (getDefaultMiddleware) => {
    return getDefaultMiddleware().concat(restApi.middleware)
  }
})

setupListeners(store.dispatch)

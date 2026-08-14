import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import { store } from './index'
import type {
  CreatePaletteRequest,
  Palette,
  PaletteSummary,
  PaletteType,
  RecordPaletteRequest,
  RecordPaletteResponse,
  UpdatePaletteRequest,
} from '../api/palettesApi'

// Palette CRUD happens on other tabs and other surfaces too, so the WS notification is the
// invalidation signal rather than relying on this tab having made the change itself.
lightingApi.palettes.subscribe(function () {
  store.dispatch(restApi.util.invalidateTags(['Palette', 'PaletteList']))
})

export const palettesApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    paletteList: build.query<PaletteSummary[], { projectId: number; type?: PaletteType }>({
      query: ({ projectId, type }) =>
        type
          ? `project/${projectId}/palettes?type=${type}`
          : `project/${projectId}/palettes`,
      providesTags: (_result, _error, { projectId }) => [
        { type: 'PaletteList', id: projectId },
        'PaletteList',
      ],
    }),

    palette: build.query<Palette, { projectId: number; paletteId: number }>({
      query: ({ projectId, paletteId }) => `project/${projectId}/palettes/${paletteId}`,
      providesTags: (_result, _error, { paletteId }) => [{ type: 'Palette', id: paletteId }],
    }),

    createPalette: build.mutation<Palette, { projectId: number } & CreatePaletteRequest>({
      query: ({ projectId, ...body }) => ({
        url: `project/${projectId}/palettes`,
        method: 'POST',
        body,
      }),
      // Guarded on the result, like every other mutation here: a create can fail on a blank
      // name (400) or a duplicate name (409), and invalidating then refetches the bank to
      // learn nothing changed.
      invalidatesTags: (result) => (result == null ? [] : ['PaletteList']),
    }),

    savePalette: build.mutation<
      Palette,
      { projectId: number; paletteId: number } & UpdatePaletteRequest
    >({
      query: ({ projectId, paletteId, ...body }) => ({
        url: `project/${projectId}/palettes/${paletteId}`,
        method: 'PUT',
        body,
      }),
      // A rename can collide (409), and nothing moved when it does.
      invalidatesTags: (result, _error, { paletteId }) =>
        result == null ? [] : [{ type: 'Palette', id: paletteId }, 'PaletteList'],
    }),

    deletePalette: build.mutation<
      void,
      { projectId: number; paletteId: number; force?: boolean }
    >({
      query: ({ projectId, paletteId, force }) => ({
        url: `project/${projectId}/palettes/${paletteId}${force ? '?force=true' : ''}`,
        method: 'DELETE',
      }),
      // Cue tags too: a forced delete leaves referencing rows dangling, and their health changes.
      //
      // Nothing is invalidated on failure, and the 409 `PALETTE_IN_USE` path is an ordinary part
      // of the flow — refetching every cue behind the still-open sheet each time an operator
      // tries to delete a palette that is in use would be pure churn.
      invalidatesTags: (result, error) =>
        error ? [] : ['PaletteList', 'Palette', 'CueList', 'Cue'],
    }),

    /**
     * Record the programmer into a palette. Lives under `/programmer` rather than the palette
     * resource because it reads the programmer buffer — the same split Session 3's record /
     * include / update follow.
     */
    recordPalette: build.mutation<RecordPaletteResponse, RecordPaletteRequest>({
      // `projectId` goes as a string, matching the backend DTO (and the sibling record /
      // include / update mutations). It survives as a number today only because Ktor's
      // DefaultJson is lenient — not something to depend on.
      query: ({ projectId, ...body }) => ({
        url: 'programmer/record-palette',
        method: 'POST',
        body: { ...body, projectId: String(projectId) },
      }),
      // Cue tags because a re-record republishes referencing cues, changing what they resolve to.
      invalidatesTags: ['PaletteList', 'Palette', 'Cue', 'CueList'],
    }),
  }),
  overrideExisting: false,
})

export const {
  usePaletteListQuery,
  usePaletteQuery,
  // Lazy: Apply needs one palette's entries at the moment it is clicked, to report which of the
  // selected fixtures it doesn't cover. Subscribing to every palette's detail up front would
  // fetch the whole bank to answer a question about one.
  useLazyPaletteQuery,
  useCreatePaletteMutation,
  useSavePaletteMutation,
  useDeletePaletteMutation,
  useRecordPaletteMutation,
} = palettesApi

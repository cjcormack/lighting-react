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
      invalidatesTags: ['PaletteList'],
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
      invalidatesTags: (_result, _error, { paletteId }) => [
        { type: 'Palette', id: paletteId },
        'PaletteList',
      ],
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
      invalidatesTags: ['PaletteList', 'Palette', 'CueList', 'Cue'],
    }),

    /**
     * Record the programmer into a palette. Lives under `/programmer` rather than the palette
     * resource because it reads the programmer buffer — the same split Session 3's record /
     * include / update follow.
     */
    recordPalette: build.mutation<RecordPaletteResponse, RecordPaletteRequest>({
      query: (body) => ({
        url: 'programmer/record-palette',
        method: 'POST',
        body,
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
  useCreatePaletteMutation,
  useSavePaletteMutation,
  useDeletePaletteMutation,
  useRecordPaletteMutation,
} = palettesApi

import { useMemo } from 'react'
import { restApi } from './restApi'
import { lightingApi } from '../api/lightingApi'
import { store } from './index'
import { useProjectCueStackListQuery } from './cueStacks'
import type {
  Cue,
  CueInput,
  CuePatchInput,
  CopyCueRequest,
  CopyCueResponse,
  ApplyCueResponse,
  StopCueResponse,
  CueCookedResponse,
} from '../api/cuesApi'

// Subscribe to WebSocket cue list changes - invalidate all cue caches
lightingApi.cues.subscribe(function () {
  store.dispatch(restApi.util.invalidateTags(['CueList']))
})

export const cuesApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    projectCueList: build.query<Cue[], number>({
      query: (projectId) => `projects/${projectId}/cues`,
      providesTags: (_result, _error, projectId) => [
        { type: 'CueList', id: projectId },
        'CueList',
      ],
    }),

    projectCue: build.query<Cue, { projectId: number; cueId: number }>({
      query: ({ projectId, cueId }) => `projects/${projectId}/cues/${cueId}`,
      providesTags: (_result, _error, { cueId }) => [{ type: 'Cue', id: cueId }],
    }),

    /**
     * What a cue actually asserts, per (target, property), and which layer won each value.
     *
     * The read behind the cue surface: since session 2a a cue is drawn as the *same* value grid the
     * programmer uses, drawn read-only, so there is no second way to express a cue's values and
     * nothing to keep in step.
     *
     * Server-side, and that is the point — composing this here would mean reimplementing layer
     * order, masks, per-layer amount and blend, group expansion and specificity in the browser,
     * and every one of those is a place for the desk and the display to disagree. Tagged `Cue` so a
     * PATCH to the cue, or a Look edit that republishes it, refetches this too.
     *
     * Effects are **not** here: an effect has no static value to report, so a cue whose look is
     * carried by a chase reads as whatever its values say. They are listed separately.
     */
    projectCueCooked: build.query<CueCookedResponse, { projectId: number; cueId: number }>({
      query: ({ projectId, cueId }) => `projects/${projectId}/cues/${cueId}/cooked`,
      providesTags: (_result, _error, { cueId }) => [{ type: 'Cue', id: cueId }],
    }),

    createProjectCue: build.mutation<Cue, { projectId: number } & CueInput>({
      query: ({ projectId, ...body }) => ({
        url: `projects/${projectId}/cues`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'CueList', id: projectId },
        'CueList',
      ],
    }),

    saveProjectCue: build.mutation<
      Cue,
      { projectId: number; cueId: number } & CueInput
    >({
      query: ({ projectId, cueId, ...body }) => ({
        url: `projects/${projectId}/cues/${cueId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, { projectId, cueId }) => [
        { type: 'CueList', id: projectId },
        { type: 'Cue', id: cueId },
        { type: 'CueStackList', id: projectId },
      ],
    }),

    patchProjectCue: build.mutation<
      Cue,
      { projectId: number; cueId: number } & CuePatchInput
    >({
      query: ({ projectId, cueId, ...body }) => ({
        url: `projects/${projectId}/cues/${cueId}`,
        method: 'PATCH',
        body,
      }),
      // Don't invalidate the project-wide CueList on PATCH — that query carries every
      // cue's full children, and keystroke-driven edits would refetch the lot. The WS
      // `cues.subscribe` invalidates CueList for changes that affect list-level fields.
      //
      // CueStackList is different: it's the lightweight entries list that the Program
      // table and Prompt Book rail render name/cue#/fade from, so it has to reflect an
      // inline edit at once. Invalidating on our own response (rather than waiting for
      // the WS echo) also guarantees the refetch sees the committed write — the echo
      // races the commit and lands a refresh one event behind.
      invalidatesTags: (_result, _error, { projectId, cueId }) => [
        { type: 'Cue', id: cueId },
        { type: 'CueStackList', id: projectId },
      ],
    }),

    deleteProjectCue: build.mutation<void, { projectId: number; cueId: number }>({
      query: ({ projectId, cueId }) => ({
        url: `projects/${projectId}/cues/${cueId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { projectId }) => [
        { type: 'CueList', id: projectId },
        'CueList',
      ],
    }),

    copyCue: build.mutation<
      CopyCueResponse,
      { projectId: number; cueId: number } & CopyCueRequest
    >({
      query: ({ projectId, cueId, ...body }) => ({
        url: `projects/${projectId}/cues/${cueId}/copy`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { targetProjectId }) => [
        { type: 'CueList', id: targetProjectId },
      ],
    }),

    applyCue: build.mutation<
      ApplyCueResponse,
      { projectId: number; cueId: number; replaceAll?: boolean }
    >({
      query: ({ projectId, cueId, replaceAll }) => ({
        url: `projects/${projectId}/cues/${cueId}/apply${replaceAll ? '?replaceAll=true' : ''}`,
        method: 'POST',
      }),
      invalidatesTags: () => [
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),

    stopCue: build.mutation<
      StopCueResponse,
      { projectId: number; cueId: number }
    >({
      query: ({ projectId, cueId }) => ({
        url: `projects/${projectId}/cues/${cueId}/stop`,
        method: 'POST',
      }),
      invalidatesTags: () => [
        'FixtureEffects',
        'GroupActiveEffects',
      ],
    }),

    // `snapshotCueFromLive` lived here until Session 3. Capturing the stage is now
    // `recordProgrammer({ source: 'STAGE_SNAPSHOT' })` in `programmerOps.ts` — the same
    // capture, plus the programmer overlay it used to miss, as one Record source among
    // several rather than an endpoint of its own.
  }),
  overrideExisting: false,
})

export const {
  useProjectCueListQuery,
  useProjectCueQuery,
  useProjectCueCookedQuery,
  useLazyProjectCueQuery,
  useCreateProjectCueMutation,
  useSaveProjectCueMutation,
  usePatchProjectCueMutation,
  useDeleteProjectCueMutation,
  useCopyCueMutation,
  useApplyCueMutation,
  useStopCueMutation,
} = cuesApi

/**
 * The cue ids currently on stage, read from the playhead (`CueStack.activeCueId`, seeded by the
 * stack-list fetch and kept live by `cueRunStateChanged`) — never from the FX effect stream. A cue
 * made of property assignments and effect-free Look layers spawns no `FxInstance` at all, so any
 * surface answering "is it on stage?" from `activeEffects` reads a rows-only cue as never running.
 * Static cues are the common case, and a pad that can't see one re-fires instead of stopping.
 */
export function useActiveCueIds(projectId: number | undefined): Set<number> {
  const { data: stacks } = useProjectCueStackListQuery(projectId!, { skip: !projectId })
  return useMemo(() => {
    const ids = new Set<number>()
    for (const stack of stacks ?? []) {
      if (stack.activeCueId != null) ids.add(stack.activeCueId)
    }
    return ids
  }, [stacks])
}

/**
 * The stack ids currently on stage — a stack is live exactly when it holds an active cue.
 *
 * Not `projectProgramState.activeStackId`: that is the show transport's playhead, a field only
 * the `/show/*` routes set. A stack activated directly (a slot pad, another client) is live in
 * the engine without ever being the playhead, and reading the playhead here would leave its pad
 * unlit — so the next tap re-activates, and `POST /cue-stacks/{id}/activate` rewinds a running
 * stack to its first cue.
 */
export function useActiveCueStackIds(projectId: number | undefined): Set<number> {
  const { data: stacks } = useProjectCueStackListQuery(projectId!, { skip: !projectId })
  return useMemo(() => {
    const ids = new Set<number>()
    for (const stack of stacks ?? []) {
      if (stack.activeCueId != null) ids.add(stack.id)
    }
    return ids
  }, [stacks])
}

import { useCallback, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { toast } from 'sonner'
import { current } from '@reduxjs/toolkit'
import { restApi } from './restApi'
import { store } from './index'
import { lightingApi } from '../api/lightingApi'
import { formatError } from '@/lib/formatError'
import { toLayoutRequest } from '@/lib/buskLayout'
import type {
  BuskLayoutRequest,
  BuskPage,
  BuskPressRequest,
  BuskPressResponse,
  CreateBuskPageRequest,
  RenameBuskPageRequest,
  ReorderBuskPagesRequest,
} from '@/api/buskApi'

/**
 * The busk layout's REST half: the pages, the whole-page write, and the press.
 *
 * Two things here are not the shapes the rest of the store uses, and both are argued:
 *
 * - **A layout write patches the cache from its own response**, where `reorderTemplates` patches
 *   optimistically and then invalidates. The difference is the response: that route answers
 *   `void`, so a refetch is the only way to learn what it did; this one answers **the page as
 *   written, carrying the ids it minted**. Those ids are load-bearing — the *next* gesture must
 *   send them or the server treats every pad as new and recreates the lot — so taking them from
 *   the response is both cheaper and more correct than a refetch.
 * - **The WS bridge suppresses the echo of our own write.** See {@link startBuskBridge}.
 */

// ─── Tag helpers ────────────────────────────────────────────────────────

/**
 * Page ids are prefixed because they share `BuskPage` with the project id, and `projectId: 7`
 * beside `pageId: 7` would be the same tag. Don't "tidy" the prefix away.
 */
function pageTag(pageId: number) {
  return { type: 'BuskPage' as const, id: `page-${pageId}` }
}

// ─── Endpoints ──────────────────────────────────────────────────────────

export const buskApi = restApi.injectEndpoints({
  endpoints: (build) => ({
    buskPages: build.query<BuskPage[], number>({
      query: (projectId) => `projects/${projectId}/busk/pages`,
      providesTags: (result, _error, projectId) => [
        { type: 'BuskPage' as const, id: projectId },
        ...(result ?? []).map((page) => pageTag(page.id)),
        'BuskPage' as const,
      ],
    }),

    createBuskPage: build.mutation<BuskPage, { projectId: number } & CreateBuskPageRequest>({
      query: ({ projectId, ...body }) => ({
        url: `projects/${projectId}/busk/pages`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (result) => (result == null ? [] : ['BuskPage']),
    }),

    renameBuskPage: build.mutation<
      BuskPage,
      { projectId: number; pageId: number } & RenameBuskPageRequest
    >({
      query: ({ projectId, pageId, ...body }) => ({
        url: `projects/${projectId}/busk/pages/${pageId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (result) => (result == null ? [] : ['BuskPage']),
    }),

    deleteBuskPage: build.mutation<void, { projectId: number; pageId: number }>({
      query: ({ projectId, pageId }) => ({
        url: `projects/${projectId}/busk/pages/${pageId}`,
        method: 'DELETE',
      }),
      // Guarded on the error rather than the result: a 204 carries no body, so `result` is
      // undefined on success too (the `deleteTemplate` note).
      invalidatesTags: (_result, error) => (error != null ? [] : ['BuskPage']),
    }),

    reorderBuskPages: build.mutation<void, { projectId: number } & ReorderBuskPagesRequest>({
      query: ({ projectId, ...body }) => ({
        url: `projects/${projectId}/busk/pages/reorder`,
        method: 'POST',
        body,
      }),
      async onQueryStarted({ projectId, pageIds }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          buskApi.util.updateQueryData('buskPages', projectId, (draft) => {
            const order = new Map(pageIds.map((id, index) => [id, index]))
            draft.forEach((page) => {
              const next = order.get(page.id)
              if (next != null) page.sortOrder = next
            })
            draft.sort((a, b) => a.sortOrder - b.sortOrder)
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patch.undo()
        }
      },
      invalidatesTags: (_result, error) => (error != null ? [] : ['BuskPage']),
    }),

    /**
     * The whole page (D10). Neither optimistic nor invalidating on its own — {@link useBuskLayoutCommit}
     * owns both, because a gesture's patch has to survive the round trip of the gesture before it.
     */
    saveBuskLayout: build.mutation<
      BuskPage,
      { projectId: number; pageId: number } & BuskLayoutRequest
    >({
      query: ({ projectId, pageId, ...body }) => ({
        url: `projects/${projectId}/busk/pages/${pageId}/layout`,
        method: 'PUT',
        body,
      }),
    }),

    /**
     * A press, whatever the pad holds. No invalidation: what the rig did comes back over the
     * programmer's applied state and the cue stack list, which the pad rings already read.
     */
    pressBuskPad: build.mutation<
      BuskPressResponse,
      { projectId: number; padId: number } & BuskPressRequest
    >({
      query: ({ projectId, padId, ...body }) => ({
        url: `projects/${projectId}/busk/pads/${padId}/press`,
        method: 'POST',
        body,
      }),
    }),
  }),
  overrideExisting: false,
})

export const {
  useBuskPagesQuery,
  useCreateBuskPageMutation,
  useRenameBuskPageMutation,
  useDeleteBuskPageMutation,
  useReorderBuskPagesMutation,
  useSaveBuskLayoutMutation,
  usePressBuskPadMutation,
} = buskApi

// ─── The echo-suppressing bridge ────────────────────────────────────────

/** Pages with a layout write in flight or queued. */
const savingPages = new Set<number>()
/** When each page's last layout response landed, so a frame that beat it can be recognised. */
const settledAt = new Map<number, number>()
const ECHO_GRACE_MS = 500

function isOwnEcho(pageIds: number[]): boolean {
  // A layout write announces exactly one page. Page CRUD and reorder announce several — a delete
  // carries the deleted id *plus every survivor*, because their sortOrder moved — so a multi-id
  // frame is never ours to swallow.
  if (pageIds.length !== 1) return false
  const pageId = pageIds[0]
  if (savingPages.has(pageId)) return true
  const settled = settledAt.get(pageId)
  return settled != null && Date.now() - settled < ECHO_GRACE_MS
}

/**
 * `busk.layoutChanged` → invalidate exactly the pages it names.
 *
 * Module scope, the default of the three forms in CLAUDE.md §"Where a WS bridge subscribes": nothing
 * on the earliest render path imports this slice, so there is no reason to defer it to `main.tsx`.
 *
 * **A foreign page id matches no tag and is a silent no-op**, which is why the frame needs no
 * project lookup: only pages this cache holds can be invalidated by their own tag. The bare tag
 * goes out alongside a multi-id frame, because a page *created* in another tab has an id this
 * cache has never seen and nothing else would catch it.
 *
 * **The echo.** Our own layout write broadcasts this frame back to us. Left alone that means a
 * refetch per gesture for a document the PUT response already carried — and, worse, a refetch that
 * can land between an optimistic patch and its own response, snapping the pads back and then
 * forward. So a single-page frame is dropped while that page is saving, or within a short grace
 * after its response (the HTTP reply and the frame are not ordered against each other).
 *
 * The cost is honest: a *foreign* single-page write landing inside that window is swallowed.
 * Per-gesture whole-page saves already concede last-write-wins (`FU-BUSK-EDIT-CONCURRENCY`) and the
 * reconnect resync is the backstop. The one case that would bite — this frame also fires for a
 * **record delete that took pads off the page**, and a stale pad's next PUT is a 400
 * `BUSK_LAYOUT_REF` — is covered from the other end: every layout failure re-reads the page.
 */
lightingApi.busk.subscribe((pageIds) => {
  if (pageIds.length === 0 || isOwnEcho(pageIds)) return
  const tags = pageIds.map(pageTag)
  store.dispatch(restApi.util.invalidateTags(pageIds.length > 1 ? [...tags, 'BuskPage'] : tags))
})

// ─── The commit queue ───────────────────────────────────────────────────

/** One edit, as a function of the page — replayable against whatever the server last confirmed. */
export type BuskLayoutOp = (page: BuskPage) => BuskPage

interface PageQueue {
  ops: BuskLayoutOp[]
  /** The last document the server confirmed. Seeded from the cache when the queue starts. */
  confirmed: BuskPage | null
  running: boolean
}

const queues = new Map<number, PageQueue>()

/**
 * Apply an op to one page in the cache.
 *
 * `current()` is not optional: the op clones the page it is handed, and handing it an Immer draft
 * would put live proxies inside the object written back — which read fine for one tick and then
 * throw once the produce call that made them has finished.
 */
function patchPage(
  dispatch: typeof store.dispatch,
  projectId: number,
  pageId: number,
  op: BuskLayoutOp,
) {
  dispatch(
    buskApi.util.updateQueryData('buskPages', projectId, (draft) => {
      const index = draft.findIndex((page) => page.id === pageId)
      if (index === -1) return
      draft[index] = op(current(draft[index]) as BuskPage)
    }),
  )
}

function queueFor(pageId: number): PageQueue {
  const existing = queues.get(pageId)
  if (existing) return existing
  const created: PageQueue = { ops: [], confirmed: null, running: false }
  queues.set(pageId, created)
  return created
}

/**
 * Save every edit-mode gesture as a whole page, one at a time, without the UI ever going backwards.
 *
 * **Operations are queued, not documents.** A gesture is `(page) => page`, so it can be replayed
 * against the freshest *confirmed* document at send time. A queue of pre-computed documents could
 * not: gesture 2's document was built before gesture 1's response existed, so it would name none of
 * the ids that response minted and the server would recreate every pad it touched.
 *
 * The optimistic patch and the wire both apply the same ops in the same order, and the client's
 * `normalisePage` mirrors the server's dense renumbering, so the only thing the two can disagree
 * about is ids — which step 4 reconciles by writing the **last** response into the cache. Writing
 * an intermediate one would describe the world a gesture ago, and that is exactly the snap-back
 * this exists to avoid.
 */
export function useBuskLayoutCommit(projectId: number, pageId: number | null) {
  const dispatch = useDispatch<typeof store.dispatch>()
  const [saveLayout] = useSaveBuskLayoutMutation()

  useEffect(() => {
    // Tidy the queue away when this page stops being shown — but **only while it is idle**. The
    // drain loop holds its `PageQueue` by closure rather than by map lookup, so deleting a running
    // one does not stop it: the next commit for the same page would mint a *second* queue beside
    // it, and the two then race through the shared `savingPages` / `settledAt` globals. The first
    // to finish would patch the cache with its own now-stale document and clear `savingPages` while
    // the other is still writing, un-suppressing the echo mid-gesture — precisely the snap-back
    // this queue exists to prevent. The dep is `pageId`, so an ordinary page-tab switch is enough
    // to reach it.
    return () => {
      if (pageId != null && queues.get(pageId)?.running !== true) queues.delete(pageId)
    }
  }, [pageId])

  return useCallback(
    (op: BuskLayoutOp) => {
      if (pageId == null) return
      const queue = queueFor(pageId)

      // Seeded *before* the optimistic patch: reading the cache afterwards would take the gesture
      // in as though the server had confirmed it, and the op would then be applied twice.
      if (queue.ops.length === 0 && !queue.running) {
        const cached = buskApi.endpoints.buskPages.select(projectId)(store.getState()).data
        queue.confirmed = cached?.find((page) => page.id === pageId) ?? null
      }

      patchPage(dispatch, projectId, pageId, op)
      queue.ops.push(op)
      if (queue.running) return
      queue.running = true
      savingPages.add(pageId)

      void (async () => {
        try {
          while (queue.ops.length > 0) {
            const next = queue.ops.shift()!
            const base = queue.confirmed
            if (base == null) throw new Error('The busk page is no longer loaded')
            queue.confirmed = await saveLayout({
              projectId,
              pageId,
              ...toLayoutRequest(next(base)),
            }).unwrap()
            settledAt.set(pageId, Date.now())
            // Only the last response describes the world the operator is looking at.
            if (queue.ops.length === 0) {
              const settled = queue.confirmed
              patchPage(dispatch, projectId, pageId, () => settled)
            }
          }
        } catch (err) {
          queue.ops.length = 0
          const restore = queue.confirmed
          if (restore != null) patchPage(dispatch, projectId, pageId, () => restore)
          // Always re-read on a failure: the write may have been refused because a record behind
          // one of these pads was deleted, and that frame is one the echo suppression can swallow.
          dispatch(restApi.util.invalidateTags([pageTag(pageId)]))
          toast.error(formatError(err))
        } finally {
          queue.running = false
          savingPages.delete(pageId)
        }
      })()
    },
    [dispatch, projectId, pageId, saveLayout],
  )
}

/**
 * Write a page the server has just answered with into the list cache.
 *
 * For the one write that does not go through {@link useBuskLayoutCommit}: the first-open generator,
 * which creates a page and then fills it in two calls. `saveBuskLayout` deliberately neither
 * invalidates nor patches on its own — the queue owns that — so without this the generated layout
 * would sit unseen until an unrelated `busk.layoutChanged` frame happened to invalidate the page.
 */
export function useCacheBuskPage(projectId: number) {
  const dispatch = useDispatch<typeof store.dispatch>()
  return useCallback(
    (page: BuskPage) => {
      dispatch(
        buskApi.util.updateQueryData('buskPages', projectId, (draft) => {
          const index = draft.findIndex((entry) => entry.id === page.id)
          if (index === -1) draft.push(page)
          else draft[index] = page
        }),
      )
    },
    [dispatch, projectId],
  )
}

/** Test seam: forget every queued gesture and echo window. */
export function resetBuskCommitState() {
  queues.clear()
  savingPages.clear()
  settledAt.clear()
}

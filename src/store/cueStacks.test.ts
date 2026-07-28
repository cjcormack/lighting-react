import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installRecordingFetch,
  installRelativeUrlRequest,
} from '@/test/backendMock'

// lightingApi opens a real WebSocket at import; mock it (also stubs the cues /
// cueStacks WS subscriptions the store registers at module load).
vi.mock('@/api/lightingApi', async () => (await import('@/test/backendMock')).lightingApiMock())

import { store } from './index'
import { restApi } from './restApi'
import { cueStacksApi } from './cueStacks'

/**
 * Wiring tests for the program-transport endpoints that replaced the old show API. They prove the
 * URL/method contract with the backend (`/show/activate`, `/show/reorder`→`/cue-stacks/reorder`,
 * GET `/show`) and the optimistic playhead patch.
 */
describe('cueStacks program transport', () => {
  let fetchMock: ReturnType<typeof installRecordingFetch>

  beforeEach(() => {
    installRelativeUrlRequest()
    // Keys are matched by substring, most-specific first.
    fetchMock = installRecordingFetch({
      'project/1/show/activate': { projectId: 1, activeStackId: 5, activatedStackName: 'Act 1' },
      'project/1/show': { projectId: 1, activeStackId: null, canEdit: true },
      'project/1/cue-stacks/reorder': {},
    })
  })

  afterEach(() => {
    store.dispatch(restApi.util.resetApiState())
    vi.unstubAllGlobals()
  })

  function lastRequestTo(fragment: string): Request | undefined {
    for (let i = fetchMock.mock.calls.length - 1; i >= 0; i--) {
      const input = fetchMock.mock.calls[i][0] as Request
      if (input.url.includes(fragment)) return input
    }
    return undefined
  }

  it('GET projectProgramState hits /show', async () => {
    await store.dispatch(cueStacksApi.endpoints.projectProgramState.initiate(1))
    await vi.waitFor(() => {
      const req = lastRequestTo('project/1/show')
      expect(req).toBeDefined()
      expect(req!.method).toBe('GET')
    })
  })

  it('activateProgram POSTs /show/activate and patches the playhead', async () => {
    await store.dispatch(cueStacksApi.endpoints.projectProgramState.initiate(1))
    await store.dispatch(cueStacksApi.endpoints.activateProgram.initiate({ projectId: 1 }))

    const req = lastRequestTo('project/1/show/activate')
    expect(req).toBeDefined()
    expect(req!.method).toBe('POST')

    await vi.waitFor(() => {
      const state = cueStacksApi.endpoints.projectProgramState.select(1)(store.getState())
      expect(state.data?.activeStackId).toBe(5)
    })
  })

  it('reorderCueStacks POSTs /cue-stacks/reorder with the stack ids', async () => {
    await store.dispatch(
      cueStacksApi.endpoints.reorderCueStacks.initiate({ projectId: 1, stackIds: [3, 1, 2] }),
    )
    const req = lastRequestTo('cue-stacks/reorder')
    expect(req).toBeDefined()
    expect(req!.method).toBe('POST')
    const body = await req!.clone().text()
    expect(JSON.parse(body)).toEqual({ stackIds: [3, 1, 2] })
  })
})

/**
 * The Program cue table renders `stack.cues` out of `projectCueStackList`, so that is the cache
 * the cue reorder has to patch optimistically — an earlier version patched `projectCueList`,
 * which nothing in Program reads, and the dragged row visibly sprang back until the refetch.
 */
describe('reorderCueStackCues optimistic patch', () => {
  const cue = (id: number, sortOrder: number) => ({
    id,
    name: `cue-${id}`,
    sortOrder,
    paletteSize: 0,
    presetCount: 0,
    adHocEffectCount: 0,
    autoAdvance: false,
    autoAdvanceDelayMs: null,
    fadeDurationMs: null,
    fadeCurve: 'LINEAR',
    cueNumber: String(id),
    cueNumberAuto: false,
    notes: null,
    cueType: 'STANDARD' as const,
  })

  beforeEach(() => {
    installRelativeUrlRequest()
    installRecordingFetch({
      'project/1/cue-stacks/7/reorder': {},
      'project/1/cue-stacks': [
        {
          id: 7,
          name: 'Act 1',
          palette: [],
          loop: false,
          sortOrder: 0,
          type: 'STACK',
          label: null,
          activeCueId: null,
          canEdit: true,
          canDelete: true,
          cues: [cue(10, 0), cue(11, 1), cue(12, 2)],
        },
      ],
    })
  })

  afterEach(() => {
    store.dispatch(restApi.util.resetApiState())
    vi.unstubAllGlobals()
  })

  const cueIdsInCache = () =>
    cueStacksApi.endpoints.projectCueStackList
      .select(1)(store.getState())
      .data?.find((s) => s.id === 7)
      ?.cues.map((c) => c.id)

  it('reorders the drilled stack in projectCueStackList', async () => {
    await store.dispatch(cueStacksApi.endpoints.projectCueStackList.initiate(1))
    await vi.waitFor(() => expect(cueIdsInCache()).toEqual([10, 11, 12]))

    const promise = store.dispatch(
      cueStacksApi.endpoints.reorderCueStackCues.initiate({
        projectId: 1,
        stackId: 7,
        cueIds: [12, 10, 11],
      }),
    )

    // Patched synchronously, before the request settles — that's what stops the snap-back.
    expect(cueIdsInCache()).toEqual([12, 10, 11])
    const patched = cueStacksApi.endpoints.projectCueStackList
      .select(1)(store.getState())
      .data?.find((s) => s.id === 7)
    expect(patched?.cues.map((c) => c.sortOrder)).toEqual([0, 1, 2])

    await promise
  })

  it('keeps cues the request did not name at the end', async () => {
    await store.dispatch(cueStacksApi.endpoints.projectCueStackList.initiate(1))
    await vi.waitFor(() => expect(cueIdsInCache()).toEqual([10, 11, 12]))

    await store.dispatch(
      cueStacksApi.endpoints.reorderCueStackCues.initiate({
        projectId: 1,
        stackId: 7,
        cueIds: [12, 10],
      }),
    )

    // The server only rewrites sortOrder for the ids it was given, so 11 lands after them.
    expect(cueIdsInCache()).toEqual([12, 10, 11])
  })

  it('leaves other stacks alone when the id is unknown', async () => {
    await store.dispatch(cueStacksApi.endpoints.projectCueStackList.initiate(1))
    await vi.waitFor(() => expect(cueIdsInCache()).toEqual([10, 11, 12]))

    await store.dispatch(
      cueStacksApi.endpoints.reorderCueStackCues.initiate({
        projectId: 1,
        stackId: 999,
        cueIds: [12, 10, 11],
      }),
    )

    expect(cueIdsInCache()).toEqual([10, 11, 12])
  })
})

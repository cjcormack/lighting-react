import { describe, expect, it, vi } from 'vitest'
import { InternalApiConnection, InternalEventType } from './internalApi'
import { createSpeedMastersWsApi, type SpeedMasterLiveState } from './speedMastersWsApi'

type EventHandler = (evType: InternalEventType, ev: Event) => void

/** Fake connection capturing the registered handler and every frame sent. */
function fakeConnection() {
  let handler: EventHandler | null = null
  const sent: Record<string, unknown>[] = []
  const conn: InternalApiConnection = {
    baseUrl: '/api/',
    readyState: () => 1,
    send: (payload: string) => {
      sent.push(JSON.parse(payload as string))
    },
    reconnect: () => {},
    subscribe: (fn) => {
      handler = fn
      return { unsubscribe: () => { handler = null } }
    },
  }
  return {
    conn,
    sent,
    fire: (evType: InternalEventType, ev: Event) => handler?.(evType, ev),
    frame: (body: unknown) =>
      handler?.(
        InternalEventType.message,
        new MessageEvent('message', { data: JSON.stringify(body) }),
      ),
  }
}

const MASTER_1: SpeedMasterLiveState = {
  uuid: 'aaaaaaaa-0000-0000-0000-000000000001',
  index: 1,
  name: 'Master 1',
  bpm: 120,
  isRunning: true,
  source: 'MANUAL',
}

const MASTER_2: SpeedMasterLiveState = {
  uuid: 'aaaaaaaa-0000-0000-0000-000000000002',
  index: 2,
  name: 'Master 2',
  bpm: 60,
  isRunning: true,
  source: 'MANUAL',
}

function stateFrame(masters: SpeedMasterLiveState[] = [MASTER_1, MASTER_2]) {
  return { type: 'speedMasters.state', masters }
}

describe('createSpeedMastersWsApi', () => {
  it('requests a state snapshot when the socket opens', () => {
    const { conn, sent, fire } = fakeConnection()
    createSpeedMastersWsApi(conn)

    fire(InternalEventType.open, new Event('open'))

    expect(sent).toEqual([{ type: 'speedMasters.state' }])
  })

  it('holds the latest bank and exposes it via getState', () => {
    const { conn, frame } = fakeConnection()
    const api = createSpeedMastersWsApi(conn)

    expect(api.getState()).toEqual([])
    frame(stateFrame())
    expect(api.getState()).toEqual([MASTER_1, MASTER_2])
  })

  it('patches one master on speedMasters-changed without touching the others', () => {
    const { conn, frame } = fakeConnection()
    const api = createSpeedMastersWsApi(conn)
    frame(stateFrame())
    const untouchedBefore = api.getState()[0]

    frame({
      type: 'speedMasters.changed',
      masterUuid: MASTER_2.uuid,
      index: 2,
      bpm: 90,
      source: 'TAP',
      timestampMs: 1,
    })

    const [m1, m2] = api.getState()
    expect(m2.bpm).toBe(90)
    expect(m2.source).toBe('TAP')
    // Identity of the untouched master is preserved — this is what keeps the strip's
    // field-wise cache patch from re-rendering every tile per tap.
    expect(m1).toBe(untouchedBefore)
  })

  it('notifies live subscribers on state and changed frames, list subscribers on CRUD only', () => {
    const { conn, frame } = fakeConnection()
    const api = createSpeedMastersWsApi(conn)
    const liveFn = vi.fn()
    const listFn = vi.fn()
    api.subscribe(liveFn)
    api.subscribeList(listFn)

    frame(stateFrame())
    frame({
      type: 'speedMasters.changed',
      masterUuid: MASTER_1.uuid,
      index: 1,
      bpm: 128,
      source: 'TAP',
      timestampMs: 1,
    })
    expect(liveFn).toHaveBeenCalledTimes(2)
    expect(listFn).not.toHaveBeenCalled()

    frame({ type: 'speedMasterListChanged' })
    expect(listFn).toHaveBeenCalledTimes(1)
    // A tempo change must never masquerade as CRUD — that is the invalidation-storm rule.
    expect(liveFn).toHaveBeenCalledTimes(2)
  })

  it('re-requests the bank when membership changes', () => {
    const { conn, sent, frame } = fakeConnection()
    createSpeedMastersWsApi(conn)

    frame({ type: 'speedMasterListChanged' })

    expect(sent).toContainEqual({ type: 'speedMasters.state' })
  })

  it('sends keyed and unkeyed tempo writes', () => {
    const { conn, sent } = fakeConnection()
    const api = createSpeedMastersWsApi(conn)

    api.setBpm(MASTER_2.uuid, 72)
    api.tap(null)

    expect(sent).toEqual([
      { type: 'speedMasters.setBpm', masterUuid: MASTER_2.uuid, bpm: 72 },
      { type: 'speedMasters.tap' },
    ])
  })

  it('ignores unrelated frames without parsing trouble', () => {
    const { conn, frame } = fakeConnection()
    const api = createSpeedMastersWsApi(conn)
    frame(stateFrame())

    frame({ type: 'channelState', changes: [] })
    frame({ type: 'fxState', bpm: 999, isClockRunning: true, activeEffects: [] })

    expect(api.getState()).toEqual([MASTER_1, MASTER_2])
  })
})

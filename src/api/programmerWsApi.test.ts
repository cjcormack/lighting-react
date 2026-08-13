import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InternalApiConnection, InternalEventType } from './internalApi'
import {
  createProgrammerApi,
  programmerKey,
  type ProgrammerEntry,
  type ProvenanceEntry,
} from './programmerWsApi'

type EventHandler = (evType: InternalEventType, ev: Event) => void

/** Fake connection capturing the registered handler and every frame sent. */
function fakeConnection() {
  let handler: EventHandler | null = null
  const sent: Record<string, unknown>[] = []
  const conn: InternalApiConnection = {
    baseUrl: '/api/',
    readyState: () => 1,
    send: (payload: string) => {
      sent.push(JSON.parse(payload))
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

const ENTRY: ProgrammerEntry = {
  targetKey: 'hex-1',
  propertyName: 'dimmer',
  value: '200',
  owner: 'web',
  touched: true,
  owners: ['web'],
}

const PROV: ProvenanceEntry = {
  targetKey: 'hex-1',
  propertyName: 'dimmer',
  source: 'PROGRAMMER',
}

function stateFrame(entries: ProgrammerEntry[] = [ENTRY], blind = false) {
  return { type: 'programmer.state', blind, entries, channels: [] }
}

describe('createProgrammerApi', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('requests a full state snapshot when the socket opens', () => {
    const { conn, sent, fire } = fakeConnection()
    createProgrammerApi(conn)

    fire(InternalEventType.open, new Event('open'))

    expect(sent).toEqual([{ type: 'programmer.state' }])
  })

  it('indexes a state snapshot by (targetKey, propertyName)', () => {
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)

    frame(stateFrame())

    expect(api.entryCount()).toBe(1)
    expect(api.getKeyState('hex-1', 'dimmer').entry).toEqual(ENTRY)
    expect(api.getState().entries.get(programmerKey('hex-1', 'dimmer'))).toEqual(ENTRY)
  })

  it('ignores frames of other types without parsing them', () => {
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)
    const spy = vi.fn()
    api.subscribe(spy)

    frame({ type: 'channelState', channels: [{ universe: 0, id: 1, currentLevel: 5 }] })

    expect(spy).not.toHaveBeenCalled()
  })

  it('does not fire when the message event is not a MessageEvent', () => {
    const { conn, fire } = fakeConnection()
    const api = createProgrammerApi(conn)
    const spy = vi.fn()
    api.subscribe(spy)

    fire(InternalEventType.message, new Event('message'))

    expect(spy).not.toHaveBeenCalled()
  })

  it('survives a malformed frame that trips the substring fast path', () => {
    const { conn, fire } = fakeConnection()
    const api = createProgrammerApi(conn)
    const spy = vi.fn()
    api.subscribe(spy)

    fire(
      InternalEventType.message,
      new MessageEvent('message', { data: '{"type":"programmer.state" oops' }),
    )

    expect(spy).not.toHaveBeenCalled()
  })

  it('applies provenance and exposes it per key', () => {
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)

    frame({ type: 'provenanceState', entries: [PROV] })

    expect(api.getKeyState('hex-1', 'dimmer').provenance).toEqual(PROV)
    // A key nothing covers is baseline-owned: absent, not a synthesised entry.
    expect(api.getKeyState('hex-1', 'strobe').provenance).toBeUndefined()
  })

  it('re-requests programmer state after provenance, debounced into one refetch', () => {
    const { conn, sent, frame } = fakeConnection()
    createProgrammerApi(conn)

    // Provenance is the only broadcast the server sends for programmer activity — including
    // writes made by MIDI surfaces, locate, or another tab — so it drives the refetch.
    frame({ type: 'provenanceState', entries: [PROV] })
    frame({ type: 'provenanceState', entries: [PROV] })
    frame({ type: 'provenanceState', entries: [PROV] })
    expect(sent).toEqual([])

    vi.advanceTimersByTime(100)

    expect(sent).toEqual([{ type: 'programmer.state' }])
  })

  it('re-arms the debounce for provenance that arrives after a refetch', () => {
    const { conn, sent, frame } = fakeConnection()
    createProgrammerApi(conn)

    frame({ type: 'provenanceState', entries: [] })
    vi.advanceTimersByTime(100)
    frame({ type: 'provenanceState', entries: [PROV] })
    vi.advanceTimersByTime(100)

    expect(sent).toHaveLength(2)
  })

  it('notifies only the keys whose state actually changed', () => {
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)
    const dimmer = vi.fn()
    const strobe = vi.fn()
    api.subscribeToKey('hex-1', 'dimmer', dimmer)
    api.subscribeToKey('hex-1', 'strobe', strobe)

    frame(stateFrame())

    expect(dimmer).toHaveBeenCalledTimes(1)
    // The strobe cell must not re-render because an unrelated property was busked.
    expect(strobe).not.toHaveBeenCalled()
  })

  it('notifies a key when its entry is removed', () => {
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)
    frame(stateFrame())

    const dimmer = vi.fn()
    api.subscribeToKey('hex-1', 'dimmer', dimmer)
    frame(stateFrame([]))

    expect(dimmer).toHaveBeenCalledTimes(1)
    expect(api.getKeyState('hex-1', 'dimmer').entry).toBeUndefined()
  })

  it('does not re-notify when a snapshot repeats an entry with identical values', () => {
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)
    frame(stateFrame())

    const dimmer = vi.fn()
    api.subscribeToKey('hex-1', 'dimmer', dimmer)
    // Fresh object, same values. Every frame arrives via JSON.parse and so is always a new
    // allocation — comparing by identity here would mark every key changed on every
    // provenance push and make the per-key channel useless.
    frame(stateFrame([{ ...ENTRY }]))

    expect(dimmer).not.toHaveBeenCalled()
  })

  it('re-notifies when a repeated entry differs in any field', () => {
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)
    frame(stateFrame())

    const dimmer = vi.fn()
    api.subscribeToKey('hex-1', 'dimmer', dimmer)

    frame(stateFrame([{ ...ENTRY, value: '10' }]))
    expect(dimmer).toHaveBeenCalledTimes(1)

    frame(stateFrame([{ ...ENTRY, value: '10', owner: 'locate', owners: ['locate'] }]))
    expect(dimmer).toHaveBeenCalledTimes(2)

    frame(stateFrame([{ ...ENTRY, value: '10', owner: 'locate', owners: ['locate'], touched: false }]))
    expect(dimmer).toHaveBeenCalledTimes(3)
  })

  it('does not re-notify when provenance repeats with identical values', () => {
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)
    frame({ type: 'provenanceState', entries: [PROV] })

    const dimmer = vi.fn()
    api.subscribeToKey('hex-1', 'dimmer', dimmer)
    // An unrelated cue firing rebroadcasts the whole provenance table; cells it doesn't touch
    // must stay quiet.
    frame({ type: 'provenanceState', entries: [{ ...PROV }] })

    expect(dimmer).not.toHaveBeenCalled()

    frame({ type: 'provenanceState', entries: [{ ...PROV, source: 'CUE', cueId: 7 }] })
    expect(dimmer).toHaveBeenCalledTimes(1)
  })

  it('reports the local connection as the owner when its write takes over a property', () => {
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)
    frame(stateFrame([{ ...ENTRY, owner: 'locate', owners: ['locate'], sourceGroup: 'Wash' }]))

    // entryChanged is unicast — it is always confirmation of OUR write, so the winning slot
    // is now `web`, whoever held it before.
    frame({
      type: 'programmer.entryChanged',
      targetType: 'fixture',
      targetKey: 'hex-1',
      propertyName: 'dimmer',
      value: '180',
    })

    const entry = api.getKeyState('hex-1', 'dimmer').entry
    expect(entry?.owner).toBe('web')
    expect(entry?.owners).toEqual(['web', 'locate'])
    expect(entry?.sourceGroup).toBeUndefined()
  })

  it('echoes an own-connection write locally before the state refetch lands', () => {
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)

    frame({
      type: 'programmer.entryChanged',
      targetType: 'fixture',
      targetKey: 'hex-1',
      propertyName: 'dimmer',
      value: '120',
    })

    expect(api.getKeyState('hex-1', 'dimmer').entry?.value).toBe('120')
    expect(api.entryCount()).toBe(1)
  })

  it('drops the entry on an own-connection clear', () => {
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)
    frame(stateFrame())

    frame({
      type: 'programmer.entryCleared',
      targetType: 'fixture',
      targetKey: 'hex-1',
      propertyName: 'dimmer',
    })

    expect(api.entryCount()).toBe(0)
  })

  it('empties the cache on clear-all', () => {
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)
    frame(stateFrame())

    frame({ type: 'programmer.cleared', entryCount: 1, effectsCleared: 2 })

    expect(api.entryCount()).toBe(0)
  })

  it('tracks the blind gate from both the snapshot and the toggle reply', () => {
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)

    expect(api.isBlind()).toBe(false)
    frame({ type: 'programmer.blindState', blind: true })
    expect(api.isBlind()).toBe(true)
    frame(stateFrame([ENTRY], false))
    expect(api.isBlind()).toBe(false)
  })

  it('reports programmer errors to error subscribers only', () => {
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)
    const errors = vi.fn()
    const keySpy = vi.fn()
    api.subscribeToErrors(errors)
    api.subscribeToKey('hex-1', 'dimmer', keySpy)

    frame({ type: 'programmer.error', message: "Unknown fixture 'nope'" })

    expect(errors).toHaveBeenCalledWith("Unknown fixture 'nope'")
    expect(keySpy).not.toHaveBeenCalled()
  })

  it('sends the documented wire shapes', () => {
    const { conn, sent } = fakeConnection()
    const api = createProgrammerApi(conn)

    api.set('fixture', 'hex-1', 'dimmer', '200', 500)
    api.setColour('fixture', 'hex-1', 'rgbColour', { r: 255, g: 0, b: 128 })
    api.setPosition('fixture', 'mover-1', 10, 20)
    api.clearEntry('group', 'Wash', 'dimmer', 1000)
    api.clearAll(2000)
    api.setBlind(true, 250)

    expect(sent).toEqual([
      {
        type: 'programmer.set',
        targetType: 'fixture',
        targetKey: 'hex-1',
        propertyName: 'dimmer',
        value: '200',
        fadeMs: 500,
      },
      {
        type: 'programmer.setColour',
        targetType: 'fixture',
        targetKey: 'hex-1',
        propertyName: 'rgbColour',
        r: 255,
        g: 0,
        b: 128,
      },
      {
        type: 'programmer.setPosition',
        targetType: 'fixture',
        targetKey: 'mover-1',
        pan: 10,
        tilt: 20,
      },
      {
        type: 'programmer.clearEntry',
        targetType: 'group',
        targetKey: 'Wash',
        propertyName: 'dimmer',
        fadeMs: 1000,
      },
      { type: 'programmer.clearAll', fadeMs: 2000 },
      { type: 'programmer.setBlind', blind: true, fadeMs: 250 },
    ])
  })

  it('carries an optional sourceGroup on the set ops', () => {
    // For fan-outs that can't send targetType:'group' — a group virtual dimmer over
    // heterogeneous members, a Highlight release restoring per-fixture values.
    const { conn, sent } = fakeConnection()
    const api = createProgrammerApi(conn)

    api.set('fixture', 'hex-1', 'dimmer', '200', undefined, 'front-wash')
    api.setPosition('fixture', 'mover-1', 10, 20, undefined, 'movers')

    expect(sent[0]).toMatchObject({ type: 'programmer.set', sourceGroup: 'front-wash' })
    expect(sent[1]).toMatchObject({ type: 'programmer.setPosition', sourceGroup: 'movers' })
  })

  it('tracks the include target from the state snapshot and the broadcast', () => {
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)
    expect(api.lastIncluded()).toBeNull()

    const target = { kind: 'CUE', cueId: 42, cueStackId: 7, cueName: 'Look 1' }
    frame({ ...stateFrame(), lastIncluded: target })
    expect(api.lastIncluded()).toEqual(target)

    // The include target is broadcast, unlike the other programmer replies: the programmer is
    // shared, so a second tab's Update button must offer the same target.
    frame({ type: 'programmer.includeTarget', target: { kind: 'CUE', cueId: 9 } })
    expect(api.lastIncluded()).toEqual({ kind: 'CUE', cueId: 9 })

    frame({ type: 'programmer.includeTarget', target: null })
    expect(api.lastIncluded()).toBeNull()
  })

  it('forgets the include target when the programmer is cleared', () => {
    // Clear releases everything Include staged, so an Update offering that target would
    // silently write nothing.
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)
    frame({ ...stateFrame(), lastIncluded: { kind: 'CUE', cueId: 42 } })

    frame({ type: 'programmer.cleared', entryCount: 1 })

    expect(api.lastIncluded()).toBeNull()
  })

  it('does not wake per-key subscribers when only the include target changed', () => {
    // `lastIncluded` is deliberately outside `entrySignature`: including a different cue must
    // not re-render every cell in a few-hundred-row sheet.
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)
    const spy = vi.fn()
    api.subscribeToKey('hex-1', 'dimmer', spy)
    frame(stateFrame())
    expect(spy).toHaveBeenCalledTimes(1)

    frame({ type: 'programmer.includeTarget', target: { kind: 'CUE', cueId: 42 } })

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('stops delivering to a key subscriber after it unsubscribes', () => {
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)
    const spy = vi.fn()
    const sub = api.subscribeToKey('hex-1', 'dimmer', spy)

    frame(stateFrame())
    expect(spy).toHaveBeenCalledTimes(1)

    sub.unsubscribe()
    frame(stateFrame([]))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('notifies a key when only the palette name changed', () => {
    // Guards the entrySignature fields. A palette rename or re-record moves nothing else on the
    // entry, so if the signature ignores them changedKeys reports nothing and the cell keeps
    // painting its old value — stale, and indistinguishable from correct.
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)
    const seen: string[][] = []
    api.subscribeToKey('hex-1', 'rgbColour', () => seen.push(['hex-1|rgbColour']))

    const entry = (paletteName: string) => ({
      targetKey: 'hex-1',
      propertyName: 'rgbColour',
      value: 'ref:2f1c9a54-8d3b-4f7e-9a11-6c0de5b47a02',
      resolvedValue: '#ff8800',
      paletteUuid: '2f1c9a54-8d3b-4f7e-9a11-6c0de5b47a02',
      paletteName,
      paletteResolved: true,
      owner: 'web',
      touched: true,
      owners: ['web'],
    })

    frame({ type: 'programmer.state', blind: false, entries: [entry('Warm Amber')], channels: [] })
    const before = seen.length
    frame({ type: 'programmer.state', blind: false, entries: [entry('Warm Amber 2')], channels: [] })
    expect(seen.length).toBeGreaterThan(before)
  })

  it('notifies a key when a reference stops resolving', () => {
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)
    let notifications = 0
    api.subscribeToKey('hex-1', 'rgbColour', () => {
      notifications += 1
    })

    const entry = (resolved: boolean) => ({
      targetKey: 'hex-1',
      propertyName: 'rgbColour',
      value: 'ref:2f1c9a54-8d3b-4f7e-9a11-6c0de5b47a02',
      resolvedValue: resolved ? '#ff8800' : undefined,
      paletteUuid: '2f1c9a54-8d3b-4f7e-9a11-6c0de5b47a02',
      paletteResolved: resolved,
      owner: 'web',
      touched: true,
      owners: ['web'],
    })

    frame({ type: 'programmer.state', blind: false, entries: [entry(true)], channels: [] })
    const before = notifications
    frame({ type: 'programmer.state', blind: false, entries: [entry(false)], channels: [] })
    expect(notifications).toBeGreaterThan(before)
  })

  it('accepts a PALETTE include target', () => {
    const { conn, frame } = fakeConnection()
    const api = createProgrammerApi(conn)
    frame({
      type: 'programmer.includeTarget',
      target: { kind: 'PALETTE', paletteId: 4, paletteName: 'Warm Amber', paletteType: 'COLOUR' },
    })
    expect(api.lastIncluded()).toEqual({
      kind: 'PALETTE',
      paletteId: 4,
      paletteName: 'Warm Amber',
      paletteType: 'COLOUR',
    })
  })
})

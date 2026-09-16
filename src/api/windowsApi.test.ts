import { describe, expect, it, vi } from 'vitest'
import { InternalEventType } from './internalApi'
import { fakeWsConnection } from '../test/fakeWsConnection'
import { announceFrame, createWindowsWsApi, parseDeskWindow, type WindowAnnounce } from './windowsApi'

/**
 * The `windows.*` wire as this side speaks it (multi-screen plan §3.4, lighting7 d774fd9) — pinned
 * by frame. Two things here are load-bearing: the announce carries **exactly five keys**, because
 * the desk's Json refuses an unknown one and drops the whole frame; and it is re-sent on every
 * `open`, because the registry keys by socket and a reconnect is a new socket.
 */

const ME: WindowAnnounce = {
  windowId: 'aaaaaaaa-0000-4000-8000-000000000001',
  name: 'Screen 1',
  view: '/projects/1/programmer',
  fullscreen: false,
  follows: true,
}

describe('the announce', () => {
  it('carries exactly windowId, name, view, fullscreen and follows — and no id or user', () => {
    expect(Object.keys(announceFrame(ME))).toEqual(['type', 'windowId', 'name', 'view', 'fullscreen', 'follows'])
    // A caller that hands over a wider object (a registry row, say) must not leak its extra keys.
    const row = { ...ME, id: 'socket-1', user: 'Chris' }
    expect(Object.keys(announceFrame(row))).toEqual(['type', 'windowId', 'name', 'view', 'fullscreen', 'follows'])
  })

  it('is sent at once while the socket is open, as the frame the desk declares', () => {
    const { conn, sent } = fakeWsConnection()
    createWindowsWsApi(conn).announce(ME)
    expect(sent).toEqual([{ type: 'windows.announce', ...ME }])
  })

  it('is re-sent on every open — the row the desk lost with the old socket', () => {
    const { conn, sent, fire } = fakeWsConnection()
    const api = createWindowsWsApi(conn)
    api.announce(ME)
    fire(InternalEventType.open, new Event('open'))
    fire(InternalEventType.open, new Event('open'))
    expect(sent).toHaveLength(3)
    expect(sent.every((f) => f.type === 'windows.announce' && f.name === 'Screen 1')).toBe(true)
  })

  it('re-sends the latest payload, not the first', () => {
    const { conn, sent, fire } = fakeWsConnection()
    const api = createWindowsWsApi(conn)
    api.announce(ME)
    api.announce({ ...ME, view: '/projects/1/busk' })
    fire(InternalEventType.open, new Event('open'))
    expect(sent.at(-1)).toMatchObject({ view: '/projects/1/busk' })
    expect(api.lastAnnounce()).toEqual({ ...ME, view: '/projects/1/busk' })
  })

  it('sends nothing on open before anything has been announced', () => {
    const { conn, sent, fire } = fakeWsConnection()
    createWindowsWsApi(conn)
    fire(InternalEventType.open, new Event('open'))
    expect(sent).toEqual([])
  })

  it('is dropped silently while the socket is down, and goes out on the next open', () => {
    // Not an operator gesture: no toast, no false. The open branch is the retry.
    const { conn, sent, fire, setOpen } = fakeWsConnection()
    const api = createWindowsWsApi(conn)
    setOpen(false)
    api.announce(ME)
    expect(sent).toEqual([])
    setOpen(true)
    fire(InternalEventType.open, new Event('open'))
    expect(sent).toEqual([{ type: 'windows.announce', ...ME }])
  })
})

describe('windows.state', () => {
  it('parses the rows, filling the desk’s dropped defaults, and seeds a late subscriber', () => {
    const { conn, frame } = fakeWsConnection()
    const api = createWindowsWsApi(conn)
    expect(api.getState()).toBeNull()

    frame({
      type: 'windows.state',
      windows: [
        { id: 's-1', windowId: 'w-1', name: 'Screen 1', view: '/projects/1/programmer' },
        { id: 's-2', windowId: 'w-2', name: 'iPad', view: '/projects/1/busk', fullscreen: true, follows: false, user: 'Chris' },
        { id: 3, name: 'junk' },
      ],
    })

    expect(api.getState()).toEqual([
      { id: 's-1', windowId: 'w-1', name: 'Screen 1', view: '/projects/1/programmer', fullscreen: false, follows: true, user: null },
      { id: 's-2', windowId: 'w-2', name: 'iPad', view: '/projects/1/busk', fullscreen: true, follows: false, user: 'Chris' },
    ])

    const seen = vi.fn()
    api.subscribe(seen)
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen.mock.calls[0]![0]).toHaveLength(2)
  })

  it('reads an absent or non-list `windows` as no windows', () => {
    const { conn, frame } = fakeWsConnection()
    const api = createWindowsWsApi(conn)
    frame({ type: 'windows.state' })
    expect(api.getState()).toEqual([])
    expect(parseDeskWindow('nope')).toBeNull()
  })
})

describe('the commands', () => {
  it('delivers the three rebroadcast commands, this window’s own included, as parsed', () => {
    const { conn, frame } = fakeWsConnection()
    const api = createWindowsWsApi(conn)
    const seen = vi.fn()
    api.subscribeCommands(seen)

    frame({ type: 'windows.show', targetId: 's-2', view: '/projects/1/busk' })
    frame({ type: 'windows.rename', targetId: 's-2', name: 'iPad' })
    frame({ type: 'windows.fullscreen', targetId: 's-2', on: false })
    frame({ type: 'windows.show', targetId: 7, view: '/x' })

    expect(seen.mock.calls.map((c) => c[0])).toEqual([
      { type: 'show', targetId: 's-2', view: '/projects/1/busk' },
      { type: 'rename', targetId: 's-2', name: 'iPad' },
      { type: 'fullscreen', targetId: 's-2', on: false },
    ])
  })

  it('sends the three commands by row id, as gestures', () => {
    const { conn, sent } = fakeWsConnection()
    const api = createWindowsWsApi(conn)
    api.show('s-2', '/projects/1/busk')
    api.rename('s-2', 'iPad')
    api.fullscreen('s-2', true)
    expect(sent).toEqual([
      { type: 'windows.show', targetId: 's-2', view: '/projects/1/busk' },
      { type: 'windows.rename', targetId: 's-2', name: 'iPad' },
      { type: 'windows.fullscreen', targetId: 's-2', on: true },
    ])
  })
})

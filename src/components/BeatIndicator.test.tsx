// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Both beat sources are mocked so this stays a component test and never reaches the real
// WebSocket. The point of the suite is *which* source a given master resolves to.
const subscribeToBeat = vi.fn((_fn: (beat: { bpm: number }) => void) => ({
  unsubscribe: vi.fn(),
}))
const requestBeatSync = vi.fn()
const subscribeToSpeedMasterBeat = vi.fn(
  (_masterUuid: string | null, _fn: (beat: { bpm: number }) => void) => ({
    unsubscribe: vi.fn(),
  }),
)

// The factories are hoisted above the consts above, so they have to call through lazily
// rather than referencing them directly.
vi.mock('../store/fx', () => ({
  subscribeToBeat: (fn: (beat: { bpm: number }) => void) => subscribeToBeat(fn),
  requestBeatSync: () => requestBeatSync(),
}))
vi.mock('../store/speedMasters', () => ({
  subscribeToSpeedMasterBeat: (masterUuid: string | null, fn: (beat: { bpm: number }) => void) =>
    subscribeToSpeedMasterBeat(masterUuid, fn),
}))

import { BeatIndicator } from './BeatIndicator'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('BeatIndicator', () => {
  it('uses the legacy unkeyed stream when given no master', () => {
    render(<BeatIndicator />)

    expect(subscribeToBeat).toHaveBeenCalledTimes(1)
    expect(subscribeToSpeedMasterBeat).not.toHaveBeenCalled()
    // The legacy stream needs an explicit nudge; the keyed one requests on subscribe.
    expect(requestBeatSync).toHaveBeenCalledTimes(1)
  })

  it('keeps master 1 on the legacy stream', () => {
    // Master 1 is the same clock either way, and `beatSync` is the compatibility surface —
    // there is nothing to gain from moving it and a wire promise to lose.
    render(<BeatIndicator master={{ uuid: null, index: 1 }} />)

    expect(subscribeToBeat).toHaveBeenCalledTimes(1)
    expect(subscribeToSpeedMasterBeat).not.toHaveBeenCalled()
  })

  it('uses the keyed stream for masters beyond the first', () => {
    render(<BeatIndicator master={{ uuid: 'aaaa-2', index: 2 }} />)

    expect(subscribeToSpeedMasterBeat).toHaveBeenCalledTimes(1)
    expect(subscribeToSpeedMasterBeat.mock.calls[0][0]).toBe('aaaa-2')
    expect(subscribeToBeat).not.toHaveBeenCalled()
    // No unkeyed request — that would ask master 1 for a beat this dot does not want.
    expect(requestBeatSync).not.toHaveBeenCalled()
  })

  it('resubscribes when the master it follows changes', () => {
    const { rerender } = render(<BeatIndicator master={{ uuid: 'aaaa-2', index: 2 }} />)
    expect(subscribeToSpeedMasterBeat.mock.calls[0][0]).toBe('aaaa-2')

    rerender(<BeatIndicator master={{ uuid: 'aaaa-3', index: 3 }} />)

    // The local interval is still ticking at the old master's tempo, so it has to re-bind
    // (and drop back to unsynced) rather than keep flashing at the wrong rate.
    expect(subscribeToSpeedMasterBeat.mock.calls.at(-1)?.[0]).toBe('aaaa-3')
  })

  it('renders an unsynced ring until the first frame arrives', () => {
    const { container } = render(<BeatIndicator master={{ uuid: 'aaaa-2', index: 2 }} />)
    const dot = container.firstElementChild as HTMLElement

    // "Not synced" is shown rather than guessed at a tempo we have not been told yet.
    expect(dot.className).toContain('border')
    expect(dot.className).not.toContain('bg-primary')
  })
})

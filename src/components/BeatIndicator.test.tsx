// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The beat source is mocked so this stays a component test and never reaches the real
// WebSocket. The point of the suite is *which master* a given prop shape resolves to.
const subscribeToSpeedMasterBeat = vi.fn(
  (_masterUuid: string | null, _fn: (beat: { bpm: number }) => void) => ({
    unsubscribe: vi.fn(),
  }),
)
const requestSpeedMasterBeat = vi.fn()
const MASTER_1_UUID = 'aaaa-1'

// The factory is hoisted above the consts above, so it has to call through lazily rather
// than referencing them directly.
vi.mock('../store/speedMasters', () => ({
  subscribeToSpeedMasterBeat: (masterUuid: string | null, fn: (beat: { bpm: number }) => void) =>
    subscribeToSpeedMasterBeat(masterUuid, fn),
  requestSpeedMasterBeat: (masterUuid: string | null) => requestSpeedMasterBeat(masterUuid),
  useMaster1Uuid: () => MASTER_1_UUID,
}))

import { BeatIndicator } from './BeatIndicator'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('BeatIndicator', () => {
  // Master 1's beat frames carry its real uuid, so a dot standing in for master 1 has to
  // resolve it — subscribing with the write-side `null` would never match a frame.
  it.each([
    ['given no master', undefined],
    ['given master 1 with a null uuid', { uuid: null, index: 1 } as const],
  ])("resolves master 1's real uuid when %s", (_label, master) => {
    render(<BeatIndicator master={master} />)

    expect(subscribeToSpeedMasterBeat).toHaveBeenCalledTimes(1)
    expect(subscribeToSpeedMasterBeat.mock.calls[0][0]).toBe(MASTER_1_UUID)
  })

  it('uses the master it was given for masters beyond the first', () => {
    render(<BeatIndicator master={{ uuid: 'aaaa-2', index: 2 }} />)

    expect(subscribeToSpeedMasterBeat).toHaveBeenCalledTimes(1)
    expect(subscribeToSpeedMasterBeat.mock.calls[0][0]).toBe('aaaa-2')
  })

  it('resubscribes when the master it follows changes', () => {
    const { rerender } = render(<BeatIndicator master={{ uuid: 'aaaa-2', index: 2 }} />)
    expect(subscribeToSpeedMasterBeat.mock.calls[0][0]).toBe('aaaa-2')

    rerender(<BeatIndicator master={{ uuid: 'aaaa-3', index: 3 }} />)

    // The local interval is still ticking at the old master's tempo, so it has to re-bind
    // (and drop back to unsynced) rather than keep flashing at the wrong rate.
    expect(subscribeToSpeedMasterBeat.mock.calls.at(-1)?.[0]).toBe('aaaa-3')
  })

  it('does not resubscribe when it regains sync', () => {
    const { container } = render(<BeatIndicator master={{ uuid: 'aaaa-2', index: 2 }} />)
    const onBeat = subscribeToSpeedMasterBeat.mock.calls[0][1]

    act(() => onBeat({ bpm: 120 }))

    // Gaining sync re-renders, but the subscription is keyed on the master alone — re-binding
    // would send a redundant requestBeat every time the dot recovers.
    expect(subscribeToSpeedMasterBeat).toHaveBeenCalledTimes(1)
    expect((container.firstElementChild as HTMLElement).className).toContain('bg-primary')
  })

  it('asks for a frame when the tab comes back, without resubscribing', () => {
    render(<BeatIndicator master={{ uuid: 'aaaa-2', index: 2 }} />)
    const onBeat = subscribeToSpeedMasterBeat.mock.calls[0][1]
    act(() => onBeat({ bpm: 120 }))
    requestSpeedMasterBeat.mockClear()

    // The local interval drifted while backgrounded, so the dot drops to unsynced — and has
    // to ask, or it waits out the throttle (up to 16 beats) showing an empty ring. jsdom
    // reports `visible` by default, which is the returning-to-the-tab case.
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(requestSpeedMasterBeat).toHaveBeenCalledWith('aaaa-2')
    expect(subscribeToSpeedMasterBeat).toHaveBeenCalledTimes(1)
  })

  it('renders an unsynced ring until the first frame arrives', () => {
    const { container } = render(<BeatIndicator master={{ uuid: 'aaaa-2', index: 2 }} />)
    const dot = container.firstElementChild as HTMLElement

    // "Not synced" is shown rather than guessed at a tempo we have not been told yet.
    expect(dot.className).toContain('border')
    expect(dot.className).not.toContain('bg-primary')
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SpeedMasterLiveState } from '../api/speedMastersWsApi'

// The strip is store-connected; mocking the store module keeps this a component test and —
// just as importantly — keeps the import graph away from lightingApi's real WebSocket.
const setSpeedMasterBpm = vi.fn()
const tapSpeedMaster = vi.fn()
const subscribeToSpeedMasterBeat = vi.fn(
  (_masterUuid: string | null, _fn: (beat: { bpm: number }) => void) => ({
    unsubscribe: () => {},
  }),
)
let liveMasters: SpeedMasterLiveState[] = []
vi.mock('../store/speedMasters', () => ({
  useSpeedMasterLiveQuery: () => ({ data: liveMasters }),
  setSpeedMasterBpm: (...args: unknown[]) => setSpeedMasterBpm(...args),
  tapSpeedMaster: (...args: unknown[]) => tapSpeedMaster(...args),
  // Each tile now carries a BeatIndicator keyed to its own master.
  subscribeToSpeedMasterBeat: (masterUuid: string | null, fn: (beat: { bpm: number }) => void) =>
    subscribeToSpeedMasterBeat(masterUuid, fn),
}))
// ...which also reaches the legacy beat stream for master 1.
vi.mock('../store/fx', () => ({
  subscribeToBeat: () => ({ unsubscribe: () => {} }),
  requestBeatSync: () => {},
}))

import { SpeedMastersStrip } from './SpeedMastersStrip'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.localStorage.clear()
})

function master(index: number, overrides: Partial<SpeedMasterLiveState> = {}): SpeedMasterLiveState {
  return {
    uuid: `aaaaaaaa-0000-0000-0000-00000000000${index}`,
    index,
    name: `Master ${index}`,
    bpm: 120,
    isRunning: true,
    source: 'MANUAL',
    ...overrides,
  }
}

describe('SpeedMastersStrip', () => {
  it('renders nothing when the bank holds only master 1', () => {
    // Master 1 is the ShowBar's own BPM tile; a strip duplicating it would be two readouts
    // for one master.
    liveMasters = [master(1)]
    const { container } = render(<SpeedMastersStrip />)
    expect(container.innerHTML).toBe('')
  })

  it('renders a tile per master beyond master 1', () => {
    liveMasters = [master(1), master(2, { bpm: 60 }), master(3, { bpm: 90 }), master(4)]
    render(<SpeedMastersStrip />)
    expect(screen.getByText(/M2 · Master 2/)).toBeTruthy()
    expect(screen.getByText(/M3 · Master 3/)).toBeTruthy()
    expect(screen.getByText(/M4 · Master 4/)).toBeTruthy()
    // The mid-width single-tile variant is also in the DOM (container queries hide it with
    // CSS, which jsdom doesn't apply), so the selected master's BPM appears twice.
    expect(screen.getAllByText('60').length).toBeGreaterThan(0)
    expect(screen.getAllByText('90').length).toBeGreaterThan(0)
  })

  it('taps the right master', () => {
    liveMasters = [master(1), master(2)]
    render(<SpeedMastersStrip compact />)
    fireEvent.click(screen.getByLabelText('Tap tempo for master 2'))
    expect(tapSpeedMaster).toHaveBeenCalledWith(liveMasters[1].uuid)
  })

  it('commits a typed tempo on Enter and sends it to the right master', () => {
    liveMasters = [master(1), master(2, { bpm: 60 })]
    render(<SpeedMastersStrip compact />)

    fireEvent.click(screen.getByText('60'))
    const input = screen.getByLabelText('Master 2 BPM')
    fireEvent.change(input, { target: { value: '96' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(setSpeedMasterBpm).toHaveBeenCalledWith(liveMasters[1].uuid, 96)
  })

  it('ignores a server push while the operator is typing', () => {
    liveMasters = [master(1), master(2, { bpm: 60 })]
    const { rerender } = render(<SpeedMastersStrip compact />)

    fireEvent.click(screen.getByText('60'))
    const input = screen.getByLabelText('Master 2 BPM') as HTMLInputElement
    fireEvent.change(input, { target: { value: '9' } })

    // Another surface taps the master mid-edit; the field must keep the draft.
    liveMasters = [master(1), master(2, { bpm: 87, source: 'TAP' })]
    rerender(<SpeedMastersStrip compact />)
    expect((screen.getByLabelText('Master 2 BPM') as HTMLInputElement).value).toBe('9')
  })

  it('escape reverts to the live value without sending anything', () => {
    liveMasters = [master(1), master(2, { bpm: 60 })]
    render(<SpeedMastersStrip compact />)

    fireEvent.click(screen.getByText('60'))
    const input = screen.getByLabelText('Master 2 BPM')
    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(setSpeedMasterBpm).not.toHaveBeenCalled()
    expect(screen.getByText('60')).toBeTruthy()
  })

  it('a garbage draft commits nothing', () => {
    liveMasters = [master(1), master(2, { bpm: 60 })]
    render(<SpeedMastersStrip compact />)

    fireEvent.click(screen.getByText('60'))
    const input = screen.getByLabelText('Master 2 BPM')
    fireEvent.change(input, { target: { value: 'fast' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(setSpeedMasterBpm).not.toHaveBeenCalled()
  })
})

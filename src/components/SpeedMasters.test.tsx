// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SpeedMasterLiveState } from '../api/speedMastersWsApi'

// Store-connected; mocking the store module keeps this a component test and — just as
// importantly — keeps the import graph away from lightingApi's real WebSocket.
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
  // Each tile carries a BeatIndicator keyed to its own master.
  subscribeToSpeedMasterBeat: (masterUuid: string | null, fn: (beat: { bpm: number }) => void) =>
    subscribeToSpeedMasterBeat(masterUuid, fn),
  useMaster1Uuid: () => liveMasters.find((m) => m.index === 1)?.uuid ?? null,
  requestSpeedMasterBeat: () => {},
}))
// The socket's readyState, driven directly: the real hook is an RTK Query subscription and this
// suite deliberately mounts the bar without a Provider.
const deskConnected = { current: true }
vi.mock('../store/status', () => ({
  useIsDeskConnected: () => deskConnected.current,
}))

import { SpeedMasters, SpeedMastersChip } from './SpeedMasters'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.localStorage.clear()
  deskConnected.current = true
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

/** Open the chip's popover and hand back its trigger. */
function openChip() {
  render(<SpeedMastersChip />)
  fireEvent.click(screen.getByLabelText('Speed masters'))
}

describe('SpeedMasters — the tile arms', () => {
  it('renders master 1 as a tile of its own', () => {
    // This inverts the old assertion. The strip used to render *nothing* for an M1-only bank,
    // because M1 was the ShowBar's separate BPM tile — the split this consolidation removed.
    liveMasters = [master(1)]
    render(<SpeedMasters />)
    expect(screen.getAllByText(/M1/).length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Tap tempo for master 1').length).toBeGreaterThan(0)
  })

  it('gives a three-master bank a higher bar to clear, rather than never tiling', () => {
    // The threshold is about affordability, not a magic cap: three tiles are fine on a wide desk,
    // so the count picks the width at which they appear.
    liveMasters = [master(1), master(2), master(3)]
    const { container } = render(<SpeedMasters />)
    expect(container.innerHTML).toContain('@[1300px]:flex')
    expect(container.innerHTML).toContain('@[1300px]:hidden')

    cleanup()
    liveMasters = [master(1), master(2), master(3), master(4)]
    const four = render(<SpeedMasters />).container
    expect(four.innerHTML).toContain('@[1600px]:flex')
  })

  it('renders a tile per master while the bank is small enough to tile', () => {
    liveMasters = [master(1), master(2, { bpm: 60 })]
    render(<SpeedMasters />)
    // jsdom applies no CSS, so every arm is queryable; the names only *display* at ≥1000px.
    expect(screen.getAllByText(/Master 1/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Master 2/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('60').length).toBeGreaterThan(0)
  })

  it('stops tiling a bank too big to afford it, at any width', () => {
    // Width alone was the wrong test. A named tile is ~150px, so at 1000px a four-master bank ate
    // ~600px and the live-state block — the one `flex-1` item, and the one an operator reads
    // mid-show — was left with nothing and clipped its cue numbers.
    liveMasters = [master(1), master(2), master(3), master(4), master(5)]
    render(<SpeedMasters />)

    // Exactly one tile — the rail's selected master. Five tiles would carry five TAPs. (The chip's
    // own TAPs live behind its popover, which is closed.)
    expect(screen.getAllByLabelText(/^Tap tempo for master/)).toHaveLength(1)
    // No tiled arm in the DOM at all, not merely hidden — jsdom applies no CSS, so a hidden arm
    // would still be queryable and this assertion would not hold.
    expect(screen.queryByText(/Master 5/)).toBeNull()
    // …but every master is still REACHABLE, which is what consolidating rather than dropping means.
    for (const index of [1, 2, 3, 4]) {
      expect(screen.getByRole('button', { name: `M${index}` })).toBeTruthy()
    }
  })

  it('the railed tile defaults to master 1', () => {
    // The persisted key was versioned precisely so desks holding the old default of `2` — still a
    // valid index — land on M1 rather than quietly defeating the rail starting there.
    liveMasters = [master(1, { bpm: 120 }), master(2, { bpm: 60 })]
    window.localStorage.setItem('showbar.speedMaster.selected', '2')
    render(<SpeedMasters />)
    expect(screen.getByRole('button', { name: 'M1', pressed: true })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'M2', pressed: false })).toBeTruthy()
  })

  it('master 1 is click-to-edit, like every other master', () => {
    // It used to be a read-only span in the ShowBar, which made the global tempo the one master
    // you could not type at while standing at the desk.
    liveMasters = [master(1, { bpm: 120 })]
    render(<SpeedMasters />)

    fireEvent.click(screen.getAllByText('120')[0])
    const input = screen.getByLabelText('Master 1 BPM')
    fireEvent.change(input, { target: { value: '128' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // A null uuid *is* master 1 on the wire — the same message the old read-only TAP sent.
    expect(setSpeedMasterBpm).toHaveBeenCalledWith(liveMasters[0].uuid, 128)
  })

  it('shows an em dash rather than a fabricated tempo before the first frame', () => {
    // The ShowBar used to read `fxState.bpm`, which defaulted to a hardcoded 120, so for a frame
    // or two at boot the desk stated a tempo nobody had set. (That field is gone now — the FX
    // panel's readout was the last consumer and moved here too.)
    liveMasters = []
    render(<SpeedMasters />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)

    // TAP still works with no uuid yet; typing does not, because there is nothing to seed a draft.
    fireEvent.click(screen.getAllByLabelText('Tap tempo for master 1')[0])
    expect(tapSpeedMaster).toHaveBeenCalledWith(null)
  })
})

describe('SpeedMastersChip — the phone arm', () => {
  it('counts the masters it is standing in for', () => {
    // The one thing the old phone ladder could not say: masters exist and you cannot see them.
    liveMasters = [master(1), master(2), master(3)]
    render(<SpeedMastersChip />)
    expect(screen.getByText('+2')).toBeTruthy()
  })

  it('taps the right master from the popover', () => {
    liveMasters = [master(1), master(2)]
    openChip()
    fireEvent.click(screen.getByLabelText('Tap tempo for master 2'))
    expect(tapSpeedMaster).toHaveBeenCalledWith(liveMasters[1].uuid)
  })

  it('stops taking taps while the desk is unreachable, rather than dropping them', () => {
    // TAP is a `speedMasters.tap` frame and the number beside it is the server's answer, so
    // against a dead socket the operator taps out a bar and nothing moves.
    liveMasters = [master(1), master(2)]
    deskConnected.current = false
    openChip()
    const tap = screen.getByLabelText('Tap tempo for master 2')
    expect(tap).toBeDisabled()
    fireEvent.click(tap)
    expect(tapSpeedMaster).not.toHaveBeenCalled()
  })

  it('commits a typed tempo on Enter and sends it to the right master', () => {
    liveMasters = [master(1), master(2, { bpm: 60 })]
    openChip()

    fireEvent.click(screen.getByText('60'))
    const input = screen.getByLabelText('Master 2 BPM')
    fireEvent.change(input, { target: { value: '96' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(setSpeedMasterBpm).toHaveBeenCalledWith(liveMasters[1].uuid, 96)
  })

  it('ignores a server push while the operator is typing', () => {
    liveMasters = [master(1), master(2, { bpm: 60 })]
    openChip()

    fireEvent.click(screen.getByText('60'))
    fireEvent.change(screen.getByLabelText('Master 2 BPM'), { target: { value: '9' } })

    // Another surface taps the master mid-edit; the field must keep the draft.
    liveMasters = [master(1), master(2, { bpm: 87, source: 'TAP' })]
    fireEvent.click(screen.getByLabelText('Tap tempo for master 1'))
    expect((screen.getByLabelText('Master 2 BPM') as HTMLInputElement).value).toBe('9')
  })

  it('escape reverts to the live value without sending anything', () => {
    liveMasters = [master(1), master(2, { bpm: 60 })]
    openChip()

    fireEvent.click(screen.getByText('60'))
    const input = screen.getByLabelText('Master 2 BPM')
    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(setSpeedMasterBpm).not.toHaveBeenCalled()
    // Still open, still showing the live value: Escape undoes the typo, it does not also throw
    // away the popover the operator is working in.
    expect(screen.getByText('60')).toBeTruthy()
  })

  it('a garbage draft commits nothing', () => {
    liveMasters = [master(1), master(2, { bpm: 60 })]
    openChip()

    fireEvent.click(screen.getByText('60'))
    const input = screen.getByLabelText('Master 2 BPM')
    fireEvent.change(input, { target: { value: 'fast' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(setSpeedMasterBpm).not.toHaveBeenCalled()
  })
})

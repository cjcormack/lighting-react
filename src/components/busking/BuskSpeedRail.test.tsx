// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SpeedMasterLiveState } from '@/api/speedMastersWsApi'
import type { SpeedMaster } from '@/api/speedMastersApi'

// Store-connected, so the store module is mocked — which also keeps the import graph away from
// lightingApi's real WebSocket, exactly as `SpeedMasters.test.tsx` does.
const setSpeedMasterBpm = vi.fn()
const tapSpeedMaster = vi.fn()
const saveMaster = vi.fn((_body: Record<string, unknown>) => ({
  unwrap: () => Promise.resolve({}),
}))
let liveMasters: SpeedMasterLiveState[] = []
let rows: SpeedMaster[] = []
vi.mock('@/store/speedMasters', () => ({
  useSpeedMasterLiveQuery: () => ({ data: liveMasters }),
  useSpeedMasterListQuery: () => ({ data: rows }),
  useSaveSpeedMasterMutation: () => [saveMaster, { isLoading: false }],
  setSpeedMasterBpm: (...args: unknown[]) => setSpeedMasterBpm(...args),
  tapSpeedMaster: (...args: unknown[]) => tapSpeedMaster(...args),
  subscribeToSpeedMasterBeat: () => ({ unsubscribe: () => {} }),
  useMaster1Uuid: () => liveMasters.find((m) => m.index === 1)?.uuid ?? null,
  requestSpeedMasterBeat: () => {},
}))
const deskConnected = { current: true }
vi.mock('@/store/status', () => ({
  useIsDeskConnected: () => deskConnected.current,
}))
// Reaches `useParams` for the project id, and renders nothing without one.
vi.mock('@/components/SpeedMasters', () => ({
  ManageMastersLink: () => <a href="/speed-masters">Manage speed masters</a>,
}))
vi.mock('react-router', () => ({
  useParams: () => ({ projectId: '7' }),
}))

import { BuskSpeedRail } from './BuskSpeedRail'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  deskConnected.current = true
})

function live(index: number, overrides: Partial<SpeedMasterLiveState> = {}): SpeedMasterLiveState {
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

function row(index: number, overrides: Partial<SpeedMaster> = {}): SpeedMaster {
  return {
    id: index * 10,
    uuid: `aaaaaaaa-0000-0000-0000-00000000000${index}`,
    masterIndex: index,
    name: `Master ${index}`,
    bpm: 120,
    source: 'MANUAL',
    referenceCount: 0,
    ...overrides,
  }
}

describe('BuskSpeedRail — the three arms', () => {
  it('gives master 1 a TAP and no usage badge', () => {
    liveMasters = [live(1, { name: 'Master' })]
    rows = [row(1)]
    render(<BuskSpeedRail />)

    expect(screen.getByLabelText('Tap tempo for master 1')).toBeInTheDocument()
    // M1 is where every unmatched category lands by definition, so a badge naming one would
    // understate it. No routable usage label may appear on its card.
    expect(screen.queryByText(/^(Dimmer|Colour|Movement|Position)$/)).toBeNull()
  })

  it('gives a manual master its own TAP and its usage badge', () => {
    liveMasters = [live(1), live(4, { name: 'Strobe', usage: 'dimmer' })]
    rows = [row(1), row(4, { name: 'Strobe', usage: 'dimmer' })]
    render(<BuskSpeedRail />)

    expect(screen.getByLabelText('Tap tempo for master 4')).toBeInTheDocument()
    expect(screen.getByText('Dimmer')).toBeInTheDocument()
    expect(screen.getByText('manual')).toBeInTheDocument()
  })

  /**
   * The rule the whole follower arm exists for: the server refuses both tempo writes on a
   * follower (`SPEED_MASTER_FOLLOWER`), so this surface must not offer either. It is the fourth
   * surface to need this arm, after the ShowBar tile, the phone popover row and the manage page.
   */
  it('gives a follower ratio chips instead of TAP, and refuses a typed tempo', () => {
    liveMasters = [
      live(1),
      live(2, { name: 'Movement', usage: 'position', bpm: 60, followNum: 1, followDen: 2 }),
    ]
    rows = [row(1), row(2, { name: 'Movement', usage: 'position', followNum: 1, followDen: 2 })]
    render(<BuskSpeedRail />)

    expect(screen.queryByLabelText('Tap tempo for master 2')).toBeNull()
    expect(screen.getByText('follows M1 · ½')).toBeInTheDocument()

    const chips = within(screen.getByRole('group', { name: 'Master 2 time signature' }))
    for (const label of ['2×', '1×', '½', '⅓', '¼']) {
      expect(chips.getByText(label)).toBeInTheDocument()
    }

    // The bpm is a readout, not a draft opener.
    fireEvent.click(screen.getByText('60'))
    expect(screen.queryByLabelText('Master 2 BPM')).toBeNull()
  })
})

describe('BuskSpeedRail — the ratio chips', () => {
  /**
   * The two rules the detail sheet's save comment spells out, restated here because this is the
   * second surface that can write a follow ratio: both halves of the pair, and **never** `bpm`
   * beside them — the server 400s that combination on a follower.
   */
  it('sends both halves of the pair and no tempo', async () => {
    liveMasters = [live(1), live(2, { bpm: 60, followNum: 1, followDen: 2 })]
    rows = [row(1), row(2, { followNum: 1, followDen: 2 })]
    render(<BuskSpeedRail />)

    fireEvent.click(screen.getByLabelText('Follow master 1 at 1/3'))

    expect(saveMaster).toHaveBeenCalledTimes(1)
    const body = saveMaster.mock.calls[0]![0]
    expect(body).toMatchObject({ projectId: 7, masterId: 20, followNum: 1, followDen: 3 })
    expect(body).not.toHaveProperty('bpm')
  })

  it('is inert until the REST row carrying the id has arrived', () => {
    // Everything drawn comes from the live frame, but the PUT needs the numeric id, which only
    // the list has. A chip with nothing to address must not pretend otherwise.
    liveMasters = [live(1), live(2, { bpm: 60, followNum: 1, followDen: 2 })]
    rows = []
    render(<BuskSpeedRail />)

    expect(screen.getByLabelText('Follow master 1 at 1/3')).toBeDisabled()
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BindingTarget } from '@/store/surfaces'

// The picker is store-connected on four axes; stub them all so this stays a unit test of
// which kinds are offered for which control type.
vi.mock('@/store/groups', () => ({ useGroupListQuery: () => ({ data: [] }) }))
vi.mock('@/store/patches', () => ({ usePatchListQuery: () => ({ data: [] }) }))
vi.mock('@/store/cueStacks', () => ({ useProjectCueStackListQuery: () => ({ data: [] }) }))
vi.mock('@/store/speedMasters', () => ({
  useSpeedMasterLiveQuery: () => ({
    data: [
      { uuid: 'm1', index: 1, name: 'Master 1', bpm: 120, isRunning: true, source: 'MANUAL' },
      { uuid: 'm2', index: 2, name: 'Master 2', bpm: 60, isRunning: true, source: 'MANUAL' },
    ],
  }),
}))

import { BindingTargetPicker } from './BindingTargetPicker'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPicker(continuous: boolean, value: BindingTarget, onChange = vi.fn()) {
  render(
    <BindingTargetPicker
      projectId={1}
      continuous={continuous}
      value={value}
      onChange={onChange}
      policy={null}
      onPolicyChange={() => {}}
    />,
  )
  return onChange
}

describe('BindingTargetPicker speed-master targets', () => {
  it('offers BPM on a continuous control and tap on a button', () => {
    // The split matters: a button press carries no position, so BPM on a button could only
    // ever jump the tempo to one fixed value.
    const { unmount } = render(
      <BindingTargetPicker
        projectId={1}
        continuous
        value={{ type: 'speedMasterBpm', masterUuid: null, minBpm: 60, maxBpm: 180 }}
        onChange={() => {}}
        policy={null}
        onPolicyChange={() => {}}
      />,
    )
    expect(screen.getByText('Speed master — BPM')).toBeInTheDocument()
    unmount()

    renderPicker(false, { type: 'speedMasterTap', masterUuid: null })
    expect(screen.getByText('Speed master — Tap')).toBeInTheDocument()
  })

  it('renders the BPM range inputs with the configured window', () => {
    renderPicker(true, { type: 'speedMasterBpm', masterUuid: 'm2', minBpm: 90, maxBpm: 150 })

    expect(screen.getByDisplayValue('90')).toBeInTheDocument()
    expect(screen.getByDisplayValue('150')).toBeInTheDocument()
  })

  it('keeps a cleared or garbage BPM range inside the clock range', () => {
    // `Number('')` is 0 and `Number('abc')` is NaN (which serialises to null); both fail the
    // backend's SpeedMasterBpm init requires during deserialisation — before the route's
    // try/catch, so they surface as a 500 rather than a validation message.
    const onChange = renderPicker(true, {
      type: 'speedMasterBpm',
      masterUuid: null,
      minBpm: 60,
      maxBpm: 180,
    })

    fireEvent.change(screen.getByDisplayValue('60'), { target: { value: '' } })
    expect(onChange.mock.calls[0][0]).toMatchObject({ minBpm: 20 })

    onChange.mockClear()
    fireEvent.change(screen.getByDisplayValue('180'), { target: { value: 'abc' } })
    expect(onChange.mock.calls[0][0]).toMatchObject({ maxBpm: 180 })
  })

  it('renders only a master picker for a tap binding', () => {
    renderPicker(false, { type: 'speedMasterTap', masterUuid: 'm2' })

    expect(screen.getByText('Speed Master')).toBeInTheDocument()
    expect(screen.queryByText('Min BPM')).not.toBeInTheDocument()
  })
})

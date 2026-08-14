// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EffectLibraryEntry } from '@/store/fixtureFx'

// The master pickers read the live bank; stub it so this is a pure gating test.
vi.mock('../../store/speedMasters', () => ({
  useSpeedMasterLiveQuery: () => ({
    data: [
      { uuid: 'm1', index: 1, name: 'Master 1', bpm: 120, isRunning: true, source: 'MANUAL' },
      { uuid: 'm2', index: 2, name: 'Master 2', bpm: 60, isRunning: true, source: 'MANUAL' },
    ],
  }),
}))

import { EffectParameterForm } from './EffectParameterForm'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function entry(overrides: Partial<EffectLibraryEntry> = {}): EffectLibraryEntry {
  return {
    name: 'Pulse',
    category: 'dimmer',
    outputType: 'SLIDER',
    effectMode: 'STANDARD',
    parameters: [],
    compatibleProperties: ['dimmer'],
    ...overrides,
  }
}

function renderForm(effect: EffectLibraryEntry) {
  return render(
    <EffectParameterForm
      effect={effect}
      beatDivision={4}
      onBeatDivisionChange={() => {}}
      blendMode="OVERRIDE"
      onBlendModeChange={() => {}}
      phaseOffset={0}
      onPhaseOffsetChange={() => {}}
      startOnBeat
      onStartOnBeatChange={() => {}}
      parameters={{}}
      onParametersChange={() => {}}
      targetPropertyName="dimmer"
      isEdit={false}
      speedMasterUuid={null}
      onSpeedMasterChange={() => {}}
      rateSpeedMasterUuid={null}
      onRateSpeedMasterChange={() => {}}
    />,
  )
}

describe('EffectParameterForm timing-source gating', () => {
  it('shows beat divisions and the speed master for a beat-timed effect', () => {
    renderForm(entry())

    expect(screen.getByText('Speed')).toBeInTheDocument()
    expect(screen.getByText('Speed Master')).toBeInTheDocument()
    expect(screen.queryByText('Cycle length')).not.toBeInTheDocument()
    expect(screen.queryByText('Rate master')).not.toBeInTheDocument()
  })

  it('treats a missing timingSource as BEAT', () => {
    // Every effect shipped before timingSource was modelled here, so the absent case must
    // keep behaving exactly as it did.
    renderForm(entry({ timingSource: undefined }))
    expect(screen.getByText('Speed')).toBeInTheDocument()
  })

  it('swaps to cycle seconds and the rate master for a wall-clock effect', () => {
    renderForm(entry({ name: 'CandleFlicker', effectMode: 'STATEFUL', timingSource: 'WALL_CLOCK' }))

    // beatDivision means *seconds* here, so beat-division chips would be a lie...
    expect(screen.getByText('Cycle length')).toBeInTheDocument()
    expect(screen.getByText('seconds')).toBeInTheDocument()
    expect(screen.queryByText('Speed')).not.toBeInTheDocument()

    // ...and a wall-clock effect never consults a speed master, so that picker would be a
    // control that does nothing. It gets the rate master instead.
    expect(screen.queryByText('Speed Master')).not.toBeInTheDocument()
    expect(screen.getByText('Rate master')).toBeInTheDocument()
  })

  it('shows the rate master for a STANDARD wall-clock effect too', () => {
    // Gating on effectMode would be wrong: calculateWallClockPhase applies the rate scale
    // for every wall-clock effect, and whether a given script reads phase is per-script.
    renderForm(entry({ effectMode: 'STANDARD', timingSource: 'WALL_CLOCK' }))
    expect(screen.getByText('Rate master')).toBeInTheDocument()
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SpeedMaster } from '../../api/speedMastersApi'

const saveMaster = vi.fn()
const deleteMaster = vi.fn()

vi.mock('../../store/speedMasters', () => ({
  useSaveSpeedMasterMutation: () => [
    (args: unknown) => ({ unwrap: () => saveMaster(args) }),
    { isLoading: false, error: undefined },
  ],
  useDeleteSpeedMasterMutation: () => [
    (args: unknown) => ({ unwrap: () => deleteMaster(args) }),
    { isLoading: false },
  ],
}))

import { SpeedMasterDetailSheet } from './SpeedMasterDetailSheet'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function master(overrides: Partial<SpeedMaster> = {}): SpeedMaster {
  return {
    id: 5,
    uuid: 'aaaaaaaa-0000-0000-0000-000000000005',
    masterIndex: 5,
    name: 'Slow Wash',
    bpm: 64,
    source: 'MANUAL',
    notes: null,
    referenceCount: 0,
    ...overrides,
  }
}

function renderSheet(m: SpeedMaster) {
  return render(
    <SpeedMasterDetailSheet open onOpenChange={() => {}} projectId={1} master={m} />,
  )
}

describe('SpeedMasterDetailSheet', () => {
  it('seeds the form from the master', () => {
    renderSheet(master({ notes: 'half-time position waves' }))

    expect(screen.getByLabelText('Name')).toHaveValue('Slow Wash')
    expect(screen.getByLabelText('Starting BPM')).toHaveValue('64')
    expect(screen.getByLabelText('Notes')).toHaveValue('half-time position waves')
  })

  it('will not let master 1 be deleted', () => {
    // Master 1 is the global tempo — the server refuses (409 SPEED_MASTER_PROTECTED), so
    // the button says so up front rather than round-tripping a doomed request.
    renderSheet(master({ id: 1, masterIndex: 1, name: 'Master 1' }))

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('keeps an in-progress edit when the master refetches', async () => {
    // The list refetches on every speedMasters.listChanged. Re-seeding on those would wipe
    // whatever the operator is halfway through typing.
    const initial = master()
    const { rerender } = renderSheet(initial)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Chorus wash' } })
    rerender(
      <SpeedMasterDetailSheet
        open
        onOpenChange={() => {}}
        projectId={1}
        // Same id, fresh object — exactly what a refetch produces.
        master={master({ name: 'Slow Wash' })}
      />,
    )

    expect(screen.getByLabelText('Name')).toHaveValue('Chorus wash')
  })

  it('rejects a starting BPM outside the clock range before sending it', () => {
    renderSheet(master())

    fireEvent.change(screen.getByLabelText('Starting BPM'), { target: { value: '900' } })

    expect(screen.getByText('Must be between 20 and 300.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('surfaces the in-use breakdown and retries with force', async () => {
    deleteMaster.mockRejectedValueOnce({
      data: {
        error: 'in use',
        code: 'SPEED_MASTER_IN_USE',
        referenceCount: 3,
        lookEffectCount: 1,
        cueAdHocEffectCount: 2,
        cueLayerCount: 0,
        cueIds: [84, 91],
      },
    })
    renderSheet(master({ referenceCount: 3 }))

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.getByText(/still point at this master/)).toBeInTheDocument())
    expect(screen.getByText(/1 look effect/)).toBeInTheDocument()
    expect(screen.getByText(/2 cue effect/)).toBeInTheDocument()
    expect(screen.getByText(/cues 84, 91/)).toBeInTheDocument()

    deleteMaster.mockResolvedValueOnce(undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Delete anyway' }))

    await waitFor(() => expect(deleteMaster).toHaveBeenCalledTimes(2))
    expect(deleteMaster.mock.calls[0][0]).toMatchObject({ masterId: 5, force: false })
    expect(deleteMaster.mock.calls[1][0]).toMatchObject({ masterId: 5, force: true })
  })

  it('omits bpm from a name-only save so a live tempo is not clobbered', async () => {
    // The PUT retunes the running clock whenever it carries a bpm, and the field is seeded
    // once per master — so resending the seed after someone tapped the master would snap
    // the live tempo back to the stored value mid-show.
    saveMaster.mockResolvedValueOnce(undefined)
    renderSheet(master())

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Chorus' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(saveMaster).toHaveBeenCalledTimes(1))
    expect(saveMaster.mock.calls[0][0]).not.toHaveProperty('bpm')
  })

  it('saves name, starting bpm and notes together', async () => {
    saveMaster.mockResolvedValueOnce(undefined)
    renderSheet(master())

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Chorus' } })
    fireEvent.change(screen.getByLabelText('Starting BPM'), { target: { value: '96' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(saveMaster).toHaveBeenCalledTimes(1))
    expect(saveMaster.mock.calls[0][0]).toMatchObject({
      projectId: 1,
      masterId: 5,
      name: 'Chorus',
      bpm: 96,
      notes: null,
    })
  })
})

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
  // The follow preview reads master 1's *live* tempo through selectFromResult; the sheet only
  // ever asks for that one number, so a fixed bank is enough.
  useSpeedMasterLiveQuery: (
    _arg: unknown,
    opts?: { selectFromResult: (r: { data: { index: number; bpm: number }[] }) => unknown },
  ) => opts?.selectFromResult({ data: [{ index: 1, bpm: 120 }] }) ?? {},
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

  it('offers master 1 no tempo mode at all', () => {
    // Master 1 is what followers derive from — the server 400s a ratio on it
    // (SPEED_MASTER_CANNOT_FOLLOW). The control is hidden rather than disabled: a segmented
    // switch with both halves dead reads as breakage.
    renderSheet(master({ id: 1, masterIndex: 1, name: 'Master 1' }))

    expect(screen.queryByRole('radio', { name: 'Follow Master 1' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Starting BPM')).toBeInTheDocument()
  })

  it('hides the starting BPM while following, and shows what the ratio resolves to', () => {
    // A follower's tempo is derived from master 1, so its stored default is meaningless while
    // linked — and the server refuses a PUT carrying both.
    renderSheet(master({ followNum: 1, followDen: 2 }))

    expect(screen.queryByLabelText('Starting BPM')).not.toBeInTheDocument()
    // Master 1 is mocked at 120, so half time is 60.
    expect(screen.getByText('60')).toBeInTheDocument()
  })

  it('sends the ratio pair and no bpm when linking a manual master', async () => {
    saveMaster.mockResolvedValueOnce(undefined)
    renderSheet(master())

    fireEvent.click(screen.getByRole('radio', { name: 'Follow Master 1' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Follow Master 1 at 1/3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(saveMaster).toHaveBeenCalledTimes(1))
    expect(saveMaster.mock.calls[0][0]).toMatchObject({ followNum: 1, followDen: 3 })
    // The pair and a bpm together is a 400 (SPEED_MASTER_FOLLOWER) — a follower has no stored
    // tempo to set.
    expect(saveMaster.mock.calls[0][0]).not.toHaveProperty('bpm')
  })

  it('unlinks by sending both halves as null', async () => {
    // A patch only changes the keys it carries, so "manual again" has to be said explicitly;
    // omitting them would leave the master following.
    saveMaster.mockResolvedValueOnce(undefined)
    renderSheet(master({ followNum: 1, followDen: 2 }))

    fireEvent.click(screen.getByRole('radio', { name: 'Manual' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(saveMaster).toHaveBeenCalledTimes(1))
    expect(saveMaster.mock.calls[0][0]).toMatchObject({ followNum: null, followDen: null })
  })

  it('leaves the follow pair out of a save that did not touch it', async () => {
    // Same reasoning as bpm: the PUT is a patch, and restating a key the operator did not
    // touch is how another tab's edit gets quietly reverted.
    saveMaster.mockResolvedValueOnce(undefined)
    renderSheet(master({ followNum: 1, followDen: 2 }))

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Chorus' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(saveMaster).toHaveBeenCalledTimes(1))
    expect(saveMaster.mock.calls[0][0]).not.toHaveProperty('followNum')
    expect(saveMaster.mock.calls[0][0]).not.toHaveProperty('usage')
  })

  it('seeds the usage select from the master', () => {
    // Routing is a fact about the bank, so the sheet has to show the one already set before it
    // can be changed — and "Not routed" is a real value, not an empty state.
    renderSheet(master({ usage: 'position' }))
    expect(screen.getByRole('combobox', { name: 'Default usage' })).toHaveTextContent(
      /movement/i,
    )

    cleanup()
    renderSheet(master())
    expect(screen.getByRole('combobox', { name: 'Default usage' })).toHaveTextContent(
      'Not routed',
    )
  })
})

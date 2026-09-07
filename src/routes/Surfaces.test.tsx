// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ControlState,
  ControlSurfaceBinding,
  ControlSurfaceType,
  SurfaceDeviceInfo,
} from '@/store/surfaces'

/**
 * The Surfaces tab's structural claims: the run-mode toolbar is **gone** (plan D1), a matched
 * device is drawn as a **picture** and an unmatched one as the explain-yourself card, the dead
 * count is a header badge, and `?binding=` still lands on the control it names.
 *
 * That last one is not decoration: the link is minted from the fixtures and groups pages, so it
 * is an in-app contract the rebuild had to carry across.
 */

let devices: SurfaceDeviceInfo[] = []
let bindings: ControlSurfaceBinding[] = []
let controls: Record<string, Record<string, ControlState>> = {}
const setBank = vi.fn()

vi.mock('@/store/surfaces', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/surfaces')>()
  return {
    ...actual,
    useSurfaceDevices: () => devices,
    useActiveBanks: () => ({}),
    useEncoderBanks: () => ({ xtc: 'colour' }),
    useSurfaceControls: () => controls,
    usePickupStates: () => ({}),
    useControlSurfaceTypeListQuery: () => ({ data: [profile] }),
    useSurfaceBindingsQuery: () => ({ data: bindings }),
    useCreateSurfaceBindingMutation: () => [vi.fn(), {}],
    useUpdateSurfaceBindingMutation: () => [vi.fn(), {}],
    useExpandSurfaceBindingMutation: () => [vi.fn(), {}],
    useDeleteSurfaceBindingMutation: () => [vi.fn(), {}],
  }
})
vi.mock('@/store/selection', () => ({
  useDeskSelection: () => [],
  clearDeskSelection: vi.fn(),
}))
vi.mock('@/store/groups', () => ({ useGroupListQuery: () => ({ data: [] }) }))
// The narrow fallback and the inspector's two editing surfaces are stubbed: each drags in the
// binding-target picker and, behind it, the speed-master bank, and none of them is what this file
// is asserting about. `EditBindingSheet` lives in the matrix module, so the stub exports both.
vi.mock('@/components/surfaces/BindingMatrix', () => ({
  BindingMatrix: () => <div data-testid="binding-matrix" />,
  EditBindingSheet: () => null,
}))
vi.mock('@/components/surfaces/LearnModeOverlay', () => ({ LearnModeOverlay: () => null }))
vi.mock('@/components/CurrentProjectRedirect', () => ({ CurrentProjectRedirect: () => null }))
vi.mock('@/store/status', () => ({ useIsDeskConnected: () => true }))
// `@/store/surfaces` is only partially mocked, so its module body still runs — and that body
// installs the bindings-changed bridge. The stub therefore has to be a whole surfaces API, not
// just the one method the page calls.
const noSubscription = { unsubscribe: () => {} }
vi.mock('@/api/lightingApi', () => ({
  lightingApi: {
    surfaces: {
      setBank: (...args: unknown[]) => setBank(...args),
      subscribeBindingsChanged: () => noSubscription,
      subscribeDevices: () => noSubscription,
      subscribeBanks: () => noSubscription,
      subscribePickup: () => noSubscription,
      subscribeControls: () => noSubscription,
      subscribeEncoderBanks: () => noSubscription,
      subscribeScaler: () => noSubscription,
      getDevices: () => null,
      getBanks: () => null,
      getScaler: () => null,
      getControls: () => null,
      getEncoderBanks: () => null,
    },
  },
}))

const profile: ControlSurfaceType = {
  typeKey: 'xtc',
  vendor: 'Behringer',
  product: 'X-Touch Compact',
  portPattern: null,
  className: 'X',
  banks: [{ id: 'layer-a', name: 'A' }],
  strips: [{ id: 'strip-1', fader: 'fader-1', select: 'btn-25', encoder: null, flash: null }],
  layout: {
    regions: [
      {
        name: 'strips',
        columns: 1,
        cells: [
          { controlId: 'fader-1', col: 0, row: 0 },
          { controlId: 'btn-25', col: 0, row: 1 },
        ],
      },
    ],
  },
  controls: [
    {
      type: 'fader',
      controlId: 'fader-1',
      label: 'Fader 1',
      cc: 1,
      channel: 1,
      hasMotor: true,
      motorCc: 1,
      touchNote: null,
      touchCc: 101,
      resolution: 'SEVEN_BIT',
    },
    { type: 'button', controlId: 'btn-25', label: 'Button 25', note: 25, channel: 1, ledFeedback: 'ON_OFF' },
  ],
}

const matched: SurfaceDeviceInfo = {
  displayKey: 'xtouch',
  displayName: 'X-Touch Compact',
  typeKey: 'xtc',
  isMatched: true,
  hasInputPort: true,
  hasOutputPort: true,
  activeBank: null,
}
const unmatched: SurfaceDeviceInfo = {
  displayKey: 'nano',
  displayName: 'nanoKONTROL2',
  typeKey: null,
  isMatched: false,
  hasInputPort: true,
  hasOutputPort: false,
  activeBank: null,
}

function binding(
  id: number,
  controlId: string,
  target: ControlSurfaceBinding['target'],
  health: ControlSurfaceBinding['health'] = { type: 'ok' },
): ControlSurfaceBinding {
  return {
    id,
    projectId: 1,
    deviceTypeKey: 'xtc',
    controlId,
    bank: null,
    target,
    targetType: target.type,
    takeoverPolicy: null,
    sortOrder: id,
    health,
  }
}

const { SurfacesContent } = await import('./Surfaces')

function renderPage(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SurfacesContent projectId={1} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  devices = [matched]
  bindings = []
  controls = {}
  setBank.mockClear()
})
afterEach(cleanup)

describe('Surfaces', () => {
  // D1: these two promise the rig will change *now*, and this is the page where the desk is
  // wired rather than run. The targets and the ShowBar's own toggles are untouched.
  it('has no Blackout or grand-master buttons', () => {
    renderPage()
    expect(screen.queryByText(/blackout/i)).toBeNull()
    expect(screen.queryByText(/^GM /i)).toBeNull()
  })

  it('draws the picture for a device with a layout', () => {
    renderPage()
    expect(screen.getByTestId('surface-panel')).toBeInTheDocument()
    expect(screen.getByTitle('Fader 1')).toBeInTheDocument()
  })

  // An unmatched device is never auto-selected — there is nothing to draw for it — but its chip
  // is a way in to the card that says why, which is the only place that explains itself.
  it('explains an unmatched device rather than drawing an empty panel', () => {
    devices = [matched, unmatched]
    renderPage()
    fireEvent.click(screen.getByText('nanoKONTROL2'))
    expect(screen.queryByTestId('surface-panel')).toBeNull()
    expect(screen.getByText(/didn’t match any registered/)).toBeInTheDocument()
  })

  it('counts every dead binding in the header', () => {
    bindings = [
      binding(1, 'fader-1', { type: 'blackout' }),
      binding(2, 'btn-25', { type: 'fireCue', cueId: 4 }, { type: 'missingCue', cueId: 4 }),
      binding(3, 'strip-1', { type: 'unknown', targetType: 'future', rawPayload: '{}' }, {
        type: 'unknownTarget',
        targetType: 'future',
      }),
    ]
    renderPage()
    expect(screen.getByText('2 dead bindings')).toBeInTheDocument()
  })

  it('opens the inspector on the control a ?binding= link names, and forces its bank', () => {
    bindings = [{ ...binding(7, 'fader-1', { type: 'blackout' }), bank: 'layer-a' }]
    renderPage('/?binding=7')
    // The inspector's own heading, not the panel's cell.
    expect(screen.getByRole('heading', { name: /Fader 1/ })).toBeInTheDocument()
    expect(setBank).toHaveBeenCalledWith('xtc', 'layer-a')
  })

  // A strip row's `controlId` is a strip id, which is in no profile's `controls` — so following
  // the link straight to it renders an empty inspector rather than an error. And this is the
  // common path, not a corner: a group on a strip is what mints the badge that links here.
  it('lands a strip binding’s link on the strip’s fader', () => {
    bindings = [binding(8, 'strip-1', { type: 'strip', target: { type: 'group', key: 'Movers' } })]
    renderPage('/?binding=8')
    expect(screen.getByRole('heading', { name: /Fader 1/ })).toBeInTheDocument()
  })
})

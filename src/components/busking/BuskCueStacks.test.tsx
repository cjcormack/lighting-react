// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CueStack, CueStackCueEntry } from '@/api/cueStacksApi'
import type { ShowTransport } from '@/hooks/useShowTransport'

// Store-connected, so the store module is mocked — which also keeps the import graph away from
// lightingApi's real WebSocket, as `BuskSpeedRail.test.tsx` does.
const goToStack = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }))
const deactivateStack = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }))
let stacks: CueStack[] = []
vi.mock('@/store/cueStacks', () => ({
  useProjectCueStackListQuery: () => ({ data: stacks }),
  useGoToStackMutation: () => [goToStack],
  useDeactivateCueStackMutation: () => [deactivateStack],
}))
vi.mock('@/store/errorToastMiddleware', () => ({ ignoreReportedError: () => {} }))

import { BuskCueStacks } from './BuskCueStacks'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  stacks = []
})

function cue(overrides: Partial<CueStackCueEntry> & Pick<CueStackCueEntry, 'id'>): CueStackCueEntry {
  return {
    name: `Cue ${overrides.id}`,
    sortOrder: overrides.id,
    layerCount: 0,
    adHocEffectCount: 0,
    autoAdvance: false,
    autoAdvanceDelayMs: null,
    fadeDurationMs: null,
    fadeCurve: 'LINEAR',
    cueNumber: String(overrides.id),
    cueNumberAuto: false,
    notes: null,
    cueType: 'STANDARD',
    ...overrides,
  }
}

function stack(overrides: Partial<CueStack> & Pick<CueStack, 'id' | 'name'>): CueStack {
  return {
    loop: false,
    sortOrder: overrides.id,
    type: 'STACK',
    label: null,
    cues: [],
    activeCueId: null,
    nextCueId: null,
    canEdit: true,
    canDelete: true,
    ...overrides,
  }
}

const go = vi.fn()
function transport(overrides: Partial<ShowTransport> = {}): ShowTransport {
  return {
    activeStackId: null,
    activeStack: undefined,
    activeCueId: null,
    serverActiveCueId: null,
    standbyCueId: null,
    completedCueIds: [],
    autoProgress: null,
    fadeProgress: null,
    fadeRemainMs: null,
    fade: null,
    goDisabled: false,
    go,
    back: () => {},
    setStandby: () => {},
    cancelAnimations: () => {},
    ...overrides,
  } as ShowTransport
}

function draw(t: ShowTransport) {
  return render(<BuskCueStacks projectId={7} transport={t} />)
}

/**
 * GO means two different requests and one gesture, and getting the split wrong is the failure this
 * pins: routing the live stack through `goToStack` would restart it at cue 1 mid-show, and routing
 * an inactive one through the transport would advance whichever *other* stack holds the playhead.
 */
describe('the stack cards', () => {
  it('advances the live stack through the shared transport', () => {
    stacks = [stack({ id: 1, name: 'Main Show', cues: [cue({ id: 10 })], activeCueId: 10 })]
    draw(transport({ activeStackId: 1, serverActiveCueId: 10 }))

    fireEvent.click(screen.getByRole('button', { name: 'GO' }))
    expect(go).toHaveBeenCalledTimes(1)
    expect(goToStack).not.toHaveBeenCalled()
  })

  it('moves the playhead when GO lands on a stack that is not live', () => {
    stacks = [
      stack({ id: 1, name: 'Main Show', cues: [cue({ id: 10 })], activeCueId: 10 }),
      stack({ id: 2, name: 'Specials', cues: [cue({ id: 20 })] }),
    ]
    draw(transport({ activeStackId: 1, serverActiveCueId: 10 }))

    const specials = screen.getByText('Specials').closest('div')!.parentElement!
    fireEvent.click(within(specials).getByRole('button', { name: 'GO' }))
    expect(goToStack).toHaveBeenCalledWith({ projectId: 7, stackId: 2 })
    expect(go).not.toHaveBeenCalled()
  })

  it('offers Release only on a stack that is running', () => {
    stacks = [
      stack({ id: 1, name: 'Main Show', cues: [cue({ id: 10 })], activeCueId: 10 }),
      stack({ id: 2, name: 'Specials', cues: [cue({ id: 20 })] }),
    ]
    draw(transport({ activeStackId: 1, serverActiveCueId: 10 }))

    const [live, idle] = screen.getAllByRole('button', { name: 'Release' })
    expect(live).not.toBeDisabled()
    expect(idle).toBeDisabled()

    fireEvent.click(live)
    expect(deactivateStack).toHaveBeenCalledWith({ projectId: 7, stackId: 1 })
  })

  /**
   * `activateAtFirstCue` starts on the armed standby when the stack has one, so naming cue 1 would
   * promise a cue the press does not fire — `nextCueId` is the server's own answer to "what does GO
   * do here", armed or positional.
   */
  it('names the armed cue, not cue 1, on an inactive stack that is standing by', () => {
    stacks = [
      stack({
        id: 1,
        name: 'Specials',
        cues: [cue({ id: 20, name: 'Bows' }), cue({ id: 21, name: 'Walk-out' })],
        nextCueId: 21,
      }),
    ]
    draw(transport({ activeStackId: null }))

    expect(screen.getByText(/Walk-out/)).toBeInTheDocument()
    expect(screen.queryByText(/Bows/)).toBeNull()
  })

  /** A stack of nothing but MARKERs has no standard cue, and `activateAtFirstCue` throws on one. */
  it('mutes GO on a stack with nothing runnable in it', () => {
    stacks = [
      stack({
        id: 1,
        name: 'Notes',
        cues: [cue({ id: 20, name: 'Interval', cueType: 'MARKER' })],
      }),
    ]
    draw(transport({ activeStackId: null }))

    expect(screen.getByRole('button', { name: 'GO' })).toBeDisabled()
  })

  /**
   * Release stops a stack without clearing the project playhead, so "holds the playhead" and "is
   * running" come apart — and only ever because of a press on this card. Keying the card off the
   * playhead alone drew the live pip beside "Inactive", and sent GO to the transport, which would
   * cross into the next stack instead of firing the cue the card had just named.
   */
  it('stops calling itself live once the live stack is released', () => {
    stacks = [stack({ id: 1, name: 'Main Show', cues: [cue({ id: 10, name: 'Preset' })] })]
    // The playhead is still here; the stack is not running.
    draw(transport({ activeStackId: 1, serverActiveCueId: null }))

    expect(screen.queryByLabelText('live')).toBeNull()
    expect(screen.getByText(/Inactive — GO fires/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'GO' }))
    expect(go).not.toHaveBeenCalled()
    expect(goToStack).toHaveBeenCalledWith({ projectId: 7, stackId: 1 })
  })

  /**
   * The live stack's state line reads the transport's cursors, not the cache's — that is what makes
   * a GO here and a GO in the ShowBar agree. The two differ during a fade, which is exactly when a
   * second copy would be caught showing the wrong cue.
   */
  it('reads the live stack’s cursors from the transport, not the cached row', () => {
    stacks = [
      stack({
        id: 1,
        name: 'Main Show',
        cues: [cue({ id: 10, name: 'Preset' }), cue({ id: 11, name: 'Act One' })],
        activeCueId: 10,
        nextCueId: 11,
      }),
    ]
    // The transport has already moved on; the cache still says cue 10 is live.
    draw(transport({ activeStackId: 1, serverActiveCueId: 11, standbyCueId: 10 }))

    expect(screen.getByText(/Act One/)).toBeInTheDocument()
  })
})

describe('the pinned cue pads', () => {
  it('fires its cue and its stack in one request', () => {
    stacks = [
      stack({ id: 1, name: 'Main Show', cues: [cue({ id: 10 })] }),
      stack({
        id: 2,
        name: 'Specials',
        cues: [cue({ id: 20, name: 'Bows', cueNumber: '9', pinnedToBusk: true })],
      }),
    ]
    draw(transport({ activeStackId: 1 }))

    // The pad's accessible name is its own content — number, name, owning stack — so the stack is
    // legible without the tooltip; the tooltip says what the press will *do*, which the content
    // cannot.
    const pad = screen.getByRole('button', { name: /Bows/ })
    expect(pad).toHaveAttribute('title', 'Fire 9 Bows in Specials')
    fireEvent.click(pad)
    // Not go-to-then-activate: the two-call form fires the target stack's first cue on the way
    // past, which is a visible blip on a live rig.
    expect(goToStack).toHaveBeenCalledTimes(1)
    expect(goToStack).toHaveBeenCalledWith({ projectId: 7, stackId: 2, cueId: 20 })
  })

  it('lights only the pad whose cue is on stage', () => {
    stacks = [
      stack({
        id: 1,
        name: 'Main Show',
        cues: [
          cue({ id: 10, name: 'Preset', pinnedToBusk: true }),
          cue({ id: 11, name: 'Act One', pinnedToBusk: true }),
        ],
        activeCueId: 11,
      }),
    ]
    draw(transport({ activeStackId: 1, serverActiveCueId: 11 }))

    expect(screen.getByRole('button', { name: /Preset/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /Act One/ })).toHaveAttribute('aria-pressed', 'true')
  })

  /**
   * `goToCue` refuses a MARKER server-side, so a pad for one could only ever fail. The pin toggle
   * is hidden on a marker too, but an imported project can carry the flag, so the filter is here
   * as well as at the point of authoring.
   */
  it('drops a pinned MARKER rather than offering a pad that cannot fire', () => {
    stacks = [
      stack({
        id: 1,
        name: 'Main Show',
        cues: [
          cue({ id: 10, name: 'Interval', cueType: 'MARKER', pinnedToBusk: true }),
          cue({ id: 11, name: 'Act One', pinnedToBusk: true }),
        ],
      }),
    ]
    draw(transport({ activeStackId: 1 }))

    expect(screen.queryByRole('button', { name: /Interval/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Act One/ })).toBeInTheDocument()
  })

  it('says how to get a pad when nothing is pinned', () => {
    stacks = [stack({ id: 1, name: 'Main Show', cues: [cue({ id: 10 })] })]
    draw(transport({ activeStackId: 1 }))

    expect(screen.getByText(/Pin one from its properties/)).toBeInTheDocument()
  })
})

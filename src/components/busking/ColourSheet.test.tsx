// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { BuskingTarget } from './buskingTypes'
import type { Fixture } from '@/store/fixtures'
import { resetLiveAppearance } from '@/lib/liveAppearance'
import { resetCellEditorSurfaceMedia } from '@/components/sheet/cells/CellEditorSurface'

/**
 * The Colour tab (busk-further plan D8): literals to Local per selected target — a group as a
 * group write, a cell by its element key — through the live push; the emitter rows by union with
 * the count of heads that take them; Pick off the appearance store, saying *mixed*; Recent as a
 * template apply; nothing written under an empty selection, toasted as the strip does; and no
 * mask refusal, only a header that says what it is about to do.
 */

vi.mock('@/api/lightingApi', async () => (await import('@/test/backendMock')).lightingApiMock())

const toast = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), warning: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const apply = vi.fn(() => ({ unwrap: () => Promise.resolve({ written: 3, skipped: [] }) }))
const toggle = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }))
let templates: unknown[] = []
vi.mock('@/store/templates', () => ({
  useTemplateListQuery: () => ({ data: templates }),
  useApplyTemplateMutation: () => [apply],
  useToggleTemplateMutation: () => [toggle],
}))
vi.mock('@/components/programmer/NewTemplateFromSelectionSheet', () => ({
  NewTemplateFromSelectionSheet: ({ open, targets, families }: { open: boolean; targets: unknown[]; families: string[] }) =>
    open ? <div data-testid="new-template" data-targets={JSON.stringify(targets)} data-families={families.join()} /> : null,
}))
vi.mock('@/store/busk', () => ({ useBuskRigQuery: () => ({ data: { rows: [] } }) }))

const colour = (extra: Record<string, unknown> = {}) => ({
  type: 'colour',
  name: 'rgbColour',
  displayName: 'Colour',
  category: 'colour',
  redChannel: { universe: 1, channelNo: 1 },
  greenChannel: { universe: 1, channelNo: 2 },
  blueChannel: { universe: 1, channelNo: 3 },
  ...extra,
})
const par1 = { key: 'par-1', name: 'PAR 1', typeKey: 'par', groups: ['Front wash', 'Reds', 'Warm'], properties: [colour()] } as unknown as Fixture
/** RGB only, like par-1: with it, 'Reds' is a group whose members agree on emitters. */
const par3 = { key: 'par-3', name: 'PAR 3', typeKey: 'par', groups: ['Reds'], properties: [colour()] } as unknown as Fixture
/** A dimmer-only head in two groups: nothing to write, nothing to read. */
const dim = {
  key: 'dim',
  name: 'Dimmer',
  typeKey: 'dimmer',
  groups: ['Front wash', 'Warm'],
  properties: [{ type: 'slider', name: 'dimmer', displayName: 'Dimmer', category: 'dimmer', channel: { universe: 1, channelNo: 20 }, min: 0, max: 255 }],
} as unknown as Fixture
const par2 = {
  key: 'par-2',
  name: 'PAR 2',
  typeKey: 'par',
  groups: ['Front wash'],
  properties: [colour({ whiteChannel: { universe: 1, channelNo: 4 } })],
} as unknown as Fixture
const bar = {
  key: 'bar',
  name: 'Bar L',
  typeKey: 'bar',
  groups: [],
  properties: [],
  elements: [
    { index: 0, key: 'bar.c1', displayName: 'Cell 1', properties: [colour({ amberChannel: { universe: 1, channelNo: 9 } })] },
    { index: 1, key: 'bar.c2', displayName: 'Cell 2', properties: [colour({ amberChannel: { universe: 1, channelNo: 10 } })] },
  ],
} as unknown as Fixture
const fixtures = [par1, par2, bar, par3, dim]
vi.mock('@/hooks/useFixtureLookup', () => ({
  useFixtureLookup: () => ({
    fixtures,
    fixtureTypes: [],
    fixtureByKey: new Map(fixtures.map((f) => [f.key, f])),
    typeByKey: new Map(),
  }),
}))
vi.mock('@/store/groups', () => ({
  useGroupListQuery: () => ({
    data: ['Front wash', 'Reds', 'Warm'].map((name) => ({ name, memberCount: 2, capabilities: [], symmetricMode: 'NONE', defaultDistribution: 'LINEAR', compatibleLookIds: [] })),
  }),
}))
vi.mock('@/store/patches', () => ({
  usePatchListQuery: () => ({ data: fixtures.map((f, i) => ({ id: i + 1, key: f.key, displayName: f.name })) }),
}))
/** What each head is showing, keyed by patch key — what the appearance leaves report. */
const appearances: Record<string, { color: string; intensity: number; segments?: { css: string; intensity: number }[] }> = {}
vi.mock('@/components/fixtures/fixtureAppearance', () => ({
  FixtureAppearanceSource: ({ patch, children }: { patch: { key: string }; children: (a: unknown) => React.ReactNode }) => {
    const appearance = appearances[patch.key]
    return appearance == null ? null : children(appearance)
  },
}))

import { lightingApi } from '@/api/lightingApi'
import { ColourSheet, emitterHeadCounts, planColourWrites } from './ColourSheet'

const groupOf = (name: string, memberCount: number): BuskingTarget => ({
  type: 'group',
  name,
  group: { name, memberCount, capabilities: [], symmetricMode: 'NONE', defaultDistribution: 'LINEAR', compatibleLookIds: [] },
})
/** Mixed: par-1 (RGB), par-2 (RGBW) and a dimmer-only head. */
const group = groupOf('Front wash', 3)
/** Uniform: par-1 and par-3, both RGB. */
const reds = groupOf('Reds', 2)
/** One colour head and one dimmer. */
const warm = groupOf('Warm', 2)
const cell: BuskingTarget = { type: 'fixture', key: 'bar.c2', fixture: bar, element: bar.elements![1] }
const whole: BuskingTarget = { type: 'fixture', key: 'par-2', fixture: par2 }

function selectionOf(...targets: BuskingTarget[]) {
  return new Map(targets.map((t) => [t.type === 'group' ? `group:${t.name}` : `fixture:${t.key}`, t]))
}

function draw(targets: BuskingTarget[], props: Partial<React.ComponentProps<typeof ColourSheet>> = {}) {
  return render(<ColourSheet projectId={1} selectedTargets={selectionOf(...targets)} families={null} {...props} />)
}

const setColour = vi.spyOn(lightingApi.programmer, 'setColour')

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  )
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }))
  appearances['par-1'] = { color: '#ff0000', intensity: 1 }
  appearances['par-2'] = { color: 'rgb(0, 0, 255)', intensity: 1 }
  appearances['par-3'] = { color: '#ff0000', intensity: 1 }
  // The default tungsten a colourless head reports: never a colour to read.
  appearances['dim'] = { color: '#fff8d5', intensity: 1 }
  appearances['bar'] = { color: '#00ff00', intensity: 1, segments: [{ css: '#111111', intensity: 1 }, { css: '#222222', intensity: 1 }] }
  templates = []
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  resetLiveAppearance()
  resetCellEditorSurfaceMedia()
})

describe('writes', () => {
  it('seeds the buffer from the rig, so a typed byte leaves the other five where the rig has them — a cell by its element key, a mixed group per member', () => {
    draw([group, cell])
    // Seeded from the first head in rig order (par-1, red) before anything is typed; nothing sent.
    expect((screen.getByLabelText('R') as HTMLInputElement).value).toBe('255')
    expect((screen.getByLabelText('G') as HTMLInputElement).value).toBe('0')
    expect(setColour).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('G'), { target: { value: '20' } })
    // Front wash is mixed (RGB + RGBW + a dimmer), so it fans per member carrying the group's name;
    // the dimmer takes nothing; the cell has amber and no white or UV, so those bytes are not sent.
    expect(setColour).toHaveBeenCalledTimes(3)
    expect(setColour).toHaveBeenCalledWith('fixture', 'par-1', 'rgbColour', { r: 255, g: 20, b: 0, w: undefined, a: undefined, uv: undefined }, 0, 'Front wash')
    expect(setColour).toHaveBeenCalledWith('fixture', 'par-2', 'rgbColour', { r: 255, g: 20, b: 0, w: 0, a: undefined, uv: undefined }, 0, 'Front wash')
    expect(setColour).toHaveBeenCalledWith('fixture', 'bar.c2', 'rgbColour', { r: 255, g: 20, b: 0, w: undefined, a: 0, uv: undefined }, 0, undefined)
  })

  it('writes a group whose members agree on emitters as one group write', () => {
    draw([reds])
    fireEvent.change(screen.getByLabelText('B'), { target: { value: '9' } })
    expect(setColour).toHaveBeenCalledTimes(1)
    expect(setColour).toHaveBeenCalledWith('group', 'Reds', 'rgbColour', { r: 255, g: 0, b: 9, w: undefined, a: undefined, uv: undefined }, 0, undefined)
  })

  it('plans a whole fixture as one write, sending only the emitters it has, and folds an undeliverable white into RGB — per member for a mixed group', () => {
    const white = { r: 0, g: 0, b: 0, w: 255, a: 0, uv: 0 }
    expect(planColourWrites([whole], white, fixtures)).toEqual([
      { targetType: 'fixture', targetKey: 'par-2', propertyName: 'rgbColour', colour: { r: 0, g: 0, b: 0, w: 255, a: undefined, uv: undefined }, sourceGroup: undefined },
    ])
    const par1Only: BuskingTarget = { type: 'fixture', key: 'par-1', fixture: par1 }
    expect(planColourWrites([par1Only], white, fixtures)[0].colour).toEqual({ r: 255, g: 255, b: 255, w: undefined, a: undefined, uv: undefined })
    // A pixel bar whose colour lives on its cells is one write per cell.
    const barWhole: BuskingTarget = { type: 'fixture', key: 'bar', fixture: bar }
    expect(planColourWrites([barWhole], white, fixtures).map((w) => w.targetKey)).toEqual(['bar.c1', 'bar.c2'])
    // Pure white over the mixed group: the RGB member gets RGB white, the RGBW member its white LED,
    // and the dimmer nothing — a single group write would have sent 0,0,0 to par-1.
    const mixed = planColourWrites([group], white, fixtures)
    expect(mixed.map((w) => [w.targetKey, w.colour.r, w.colour.w, w.sourceGroup])).toEqual([
      ['par-1', 255, undefined, 'Front wash'],
      ['par-2', 0, 255, 'Front wash'],
    ])
    // Agreeing members: one group write, folded for what they share.
    expect(planColourWrites([reds], white, fixtures)).toEqual([
      { targetType: 'group', targetKey: 'Reds', propertyName: 'rgbColour', colour: { r: 255, g: 255, b: 255, w: undefined, a: undefined, uv: undefined } },
    ])
  })

  it('writes nothing under an empty selection, and toasts as the strip does', () => {
    draw([])
    fireEvent.change(screen.getByLabelText('R'), { target: { value: '10' } })
    expect(setColour).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Select the fixtures this should land on first', expect.objectContaining({ id: expect.any(String) }))
  })

  it('leaves the picker’s knob where it is on a typed byte, and moves it only on Pick — the seed is not the live colour', () => {
    // Two changes in one task is what put react-colorful into a ping-pong with the sheet when the
    // live colour was its seed; the knob must not follow the fields at all. With nothing reported
    // the buffer stays neutral, so the knob starts at white.
    delete appearances['par-1']
    delete appearances['par-2']
    delete appearances['dim']
    draw([group])
    const knob = () => document.querySelector('.react-colorful__saturation [aria-valuetext]')!.getAttribute('aria-valuetext')
    expect(knob()).toBe('Saturation 0%, Brightness 100%')
    fireEvent.change(screen.getByLabelText('R'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('G'), { target: { value: '20' } })
    expect(knob()).toBe('Saturation 0%, Brightness 100%')
    // The first byte went at once, one write per member; the second sits under the floor.
    expect(setColour).toHaveBeenCalledTimes(2)
  })

  it('ends the gesture on a release anywhere in the window, and never flushes a stale colour onto a new selection', () => {
    const { rerender } = draw([reds])
    fireEvent.change(screen.getByLabelText('R'), { target: { value: '10' } })
    expect(setColour).toHaveBeenCalledTimes(1)
    // The picker binds its release to the document; a release outside the sheet still ends it.
    fireEvent.pointerUp(window)
    expect(setColour).toHaveBeenCalledTimes(1)
    // A new selection: the gesture is over and the buffer re-seeded, so a later release writes nothing.
    rerender(<ColourSheet projectId={1} selectedTargets={selectionOf(cell)} families={null} />)
    fireEvent.pointerUp(window)
    fireEvent.pointerUp(document.querySelector('[data-colour-sheet]')!)
    expect(setColour).toHaveBeenCalledTimes(1)
    // The field keeps its typed draft until it blurs; the value underneath is the cell's.
    fireEvent.blur(screen.getByLabelText('R'))
    expect((screen.getByLabelText('R') as HTMLInputElement).value).toBe('34')
  })

  it('does not consult the mask: a drag under a Position mask still lands, and the header says what it will do', () => {
    draw([group, cell], { families: ['POSITION'] })
    expect(document.querySelector('[data-colour-sheet-heading]')).toHaveTextContent('Colour of 4 heads · writes to Local')
    expect(screen.getByText('Position')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('G'), { target: { value: '5' } })
    expect(setColour).toHaveBeenCalledTimes(3)
  })
})

describe('emitters', () => {
  it('draws the rows for the selection’s union with the count of heads that take them', () => {
    draw([group, cell])
    // par-2 has white, the cell has amber, nothing has UV.
    expect(screen.getByLabelText('W value')).toBeInTheDocument()
    expect(screen.getByLabelText('A value')).toBeInTheDocument()
    expect(screen.queryByLabelText('UV value')).toBeNull()
    // par-2 (white) and the cell (amber) take an emitter; par-1 and the dimmer do not.
    expect(document.querySelector('[data-colour-emitters]')).toHaveTextContent('Emitters on 2 of 4 heads · the rest take RGB only')
    expect(emitterHeadCounts([{ key: 'bar', properties: [], elements: bar.elements }])).toEqual({ white: 0, amber: 1, uv: 0, any: 1 })
    // `any` counts heads, not emitters: one head with both is one head.
    expect(
      emitterHeadCounts([{ key: 'x', properties: [colour({ whiteChannel: { universe: 1, channelNo: 4 }, amberChannel: { universe: 1, channelNo: 5 } }) as never] }]),
    ).toEqual({ white: 1, amber: 1, uv: 0, any: 1 })
  })
})

describe('Pick', () => {
  it('reads the first head in rig order into the picker without writing, and says mixed when the heads disagree', () => {
    draw([group])
    fireEvent.change(screen.getByLabelText('B'), { target: { value: '40' } })
    fireEvent.blur(screen.getByLabelText('B'))
    fireEvent.click(screen.getByRole('button', { name: /Pick/ }))
    expect((screen.getByLabelText('R') as HTMLInputElement).value).toBe('255')
    expect((screen.getByLabelText('G') as HTMLInputElement).value).toBe('0')
    expect((screen.getByLabelText('B') as HTMLInputElement).value).toBe('0')
    expect(document.querySelector('[data-colour-picked="mixed"]')).not.toBeNull()
    expect(document.querySelector('.react-colorful__saturation [aria-valuetext]')!.getAttribute('aria-valuetext')).toBe('Saturation 100%, Brightness 100%')
    // The typed byte was the only write; Pick added none.
    expect(setColour).toHaveBeenCalledTimes(2)
  })

  it('ignores a head with no colour descriptor: a dimmer’s default tungsten is neither read nor counted as mixed', () => {
    draw([warm])
    fireEvent.click(screen.getByRole('button', { name: /Pick/ }))
    expect((screen.getByLabelText('R') as HTMLInputElement).value).toBe('255')
    expect((screen.getByLabelText('G') as HTMLInputElement).value).toBe('0')
    expect(document.querySelector('[data-colour-picked="mixed"]')).toBeNull()
  })

  it('reads a cell off its parent’s segment, and a selection that agrees is not mixed', () => {
    draw([cell])
    fireEvent.click(screen.getByRole('button', { name: /Pick/ }))
    expect((screen.getByLabelText('R') as HTMLInputElement).value).toBe('34')
    expect(document.querySelector('[data-colour-picked="mixed"]')).toBeNull()
  })

  it('is a read and not a write: a pointer lifted over the sheet afterwards sends nothing', () => {
    draw([group])
    fireEvent.click(screen.getByRole('button', { name: /Pick/ }))
    fireEvent.pointerUp(document.querySelector('[data-colour-sheet]')!)
    expect(setColour).not.toHaveBeenCalled()
  })
})

describe('Recent', () => {
  const template = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
    id,
    uuid: `t${id}`,
    name,
    notes: null,
    fadeDurationMs: null,
    family: 'COLOUR',
    isGeneric: true,
    kind: 'value',
    rows: [{ propertyName: 'rgbColour', value: '#ffaa00', targetType: 'generic', targetKey: null, sortOrder: 0 }],
    effect: null,
    requiredEmitters: [],
    lastPressedAt: '2026-09-18T10:00:00Z',
    layerCount: 0,
    ...extra,
  })

  it('draws the colour recents most recent first, and a tap is a template apply', () => {
    templates = [
      template(1, 'Deep Blue', { lastPressedAt: '2026-09-18T09:00:00Z' }),
      template(2, 'Warm Amber'),
      template(3, 'Home', { family: 'POSITION' }),
      template(4, 'UV wash', { requiredEmitters: ['uv'] }),
      template(5, 'Never', { lastPressedAt: null }),
    ]
    draw([group, cell])
    const chips = document.querySelectorAll('[data-recent-template]')
    expect([...chips].map((c) => c.textContent)).toEqual(['Warm Amber', 'Deep Blue'])
    fireEvent.click(within(chips[0] as HTMLElement).getByText('Warm Amber'))
    expect(apply).toHaveBeenCalledWith({
      projectId: 1,
      templateId: 2,
      targets: [
        { type: 'group', key: 'Front wash' },
        { type: 'fixture', key: 'bar.c2' },
      ],
      families: undefined,
    })
    expect(toggle).not.toHaveBeenCalled()
  })
})

describe('the two doors out', () => {
  it('opens the new-template sheet over the selection as colour', () => {
    draw([group, cell])
    fireEvent.click(screen.getByRole('button', { name: /Save as template/ }))
    const sheet = screen.getByTestId('new-template')
    expect(sheet).toHaveAttribute('data-families', 'COLOUR')
    expect(JSON.parse(sheet.getAttribute('data-targets')!)).toEqual([
      { type: 'group', key: 'Front wash' },
      { type: 'fixture', key: 'bar.c2' },
    ])
  })

  it('hands the Second colour switch the current colour once wired, and draws it inert on a host with no Spread tab', () => {
    const { unmount } = draw([group])
    expect(screen.getByRole('switch')).toBeDisabled()
    unmount()
    const onSpread = vi.fn()
    draw([group], { onSpread })
    expect(screen.getByRole('switch')).toBeEnabled()
    fireEvent.change(screen.getByLabelText('B'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('switch'))
    expect(onSpread).toHaveBeenCalledWith({ r: 255, g: 0, b: 7, w: 0, a: 0, uv: 0 })
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TemplateSummary } from '@/api/templatesApi'

/**
 * The strip's three load-bearing behaviours: **the selection is the filter**, **the selection is
 * the target**, and **the two gestures are two routes**.
 *
 * The filter is what makes the strip usable without a picker — select colour cells and only colour
 * templates are offered, select RGB pars and no position template is — so a regression there turns
 * it back into a list of everything. The target rule is what makes a marquee mean something: three
 * colour cells land the press on those three heads. And the click/⌥click split is the difference
 * between a literal and a dependency, which is invisible on screen: only the route called says
 * which happened.
 *
 * Targets and their families arrive as props from the container, which is the only thing that
 * knows which rows the cells sit on; the tests hand them in directly.
 */
const applyTemplate = vi.fn()
const toggleTemplate = vi.fn()
let templates: TemplateSummary[] = []
/** What `apply` resolves with — the two arms report in different fields, so the tests set it. */
let applyResult: unknown = { written: 1, skipped: [] }

const toastSuccess = vi.fn()
const toastWarning = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    warning: (...args: unknown[]) => toastWarning(...args),
    error: vi.fn(),
  },
}))

vi.mock('@/store/templates', () => ({
  useTemplateListQuery: () => ({ data: templates }),
  useApplyTemplateMutation: () => [
    (args: unknown) => {
      applyTemplate(args)
      return { unwrap: () => Promise.resolve(applyResult) }
    },
  ],
  useToggleTemplateMutation: () => [
    (args: unknown) => {
      toggleTemplate(args)
      return { unwrap: () => Promise.resolve({ action: 'applied', effectCount: 0 }) }
    },
  ],
  useCreateTemplateFromProgrammerMutation: () => [vi.fn(), { isLoading: false, reset: vi.fn() }],
}))
const newSheetProps = vi.fn()
vi.mock('./NewTemplateFromSelectionSheet', () => ({
  NewTemplateFromSelectionSheet: (props: { open: boolean }) => {
    newSheetProps(props)
    return props.open ? <div data-testid="new-sheet" /> : null
  },
}))

const { TemplateStrip } = await import('./TemplateStrip')
import type { TemplateTarget } from '@/api/templatesApi'
import type { AttributeFamily } from '@/lib/attributeFamily'
import type { CellRef } from '@/components/fixtures-list/cellSelectionModel'

const HEX_1: TemplateTarget[] = [{ type: 'fixture', key: 'hex-1' }]
const COLOUR_CELL: CellRef[] = [{ rowId: 'fixture:hex-1', col: 'colour' }]

/** The strip with the container's three answers: cells, where a press lands, what those heads have. */
function strip(
  cells: CellRef[],
  targets: TemplateTarget[] = HEX_1,
  targetFamilies: AttributeFamily[] = ['INTENSITY', 'COLOUR'],
) {
  return (
    <TemplateStrip projectId={1} cells={cells} targets={targets} targetFamilies={targetFamilies} />
  )
}

function template(over: Partial<TemplateSummary> = {}): TemplateSummary {
  return {
    id: 1,
    uuid: 'u1',
    name: 'Amber Key',
    notes: null,
    fadeDurationMs: null,
    family: 'COLOUR',
    isGeneric: true,
    rows: [
      { targetType: 'deferred', targetKey: '', propertyName: 'rgbColour', value: '#FF9D4A;policy=extract' },
    ],
    kind: 'value',
    effect: null,
    layerCount: 0,
    buskPageCount: 0,
    ...over,
  }
}

const AMBER = template()
const HALF_UP = template({
  id: 2,
  uuid: 'u2',
  name: 'Half Up',
  family: 'INTENSITY',
  rows: [{ targetType: 'deferred', targetKey: '', propertyName: 'dimmer', value: 'pct:50' }],
})

/** An effect template: one effect, no rows, always generic (fx-templates D1–D3). */
const BREATHE = template({
  id: 3,
  uuid: 'u3',
  name: 'Amber Breathe',
  family: 'COLOUR',
  kind: 'effect',
  rows: [],
  effect: {
    effectType: 'ColourPulse',
    category: 'colour',
    beatDivision: 0.5,
    blendMode: 'OVERRIDE',
    distribution: 'LINEAR',
    parameters: {},
    timingSource: 'BEAT',
  },
})

beforeEach(() => {
  applyTemplate.mockClear()
  toggleTemplate.mockClear()
  toastSuccess.mockClear()
  toastWarning.mockClear()
  applyResult = { written: 1, skipped: [] }
  templates = [AMBER, HALF_UP]
  newSheetProps.mockClear()
})
afterEach(cleanup)

describe('TemplateStrip', () => {
  it('offers only the families the selected cells name', () => {
    render(strip(COLOUR_CELL))
    expect(screen.getByText('Amber Key')).toBeInTheDocument()
    expect(screen.queryByText('Half Up')).not.toBeInTheDocument()
  })

  it('follows the selection when it moves to another column', () => {
    render(strip([{ rowId: 'fixture:hex-1', col: 'dimmer' }]))
    expect(screen.getByText('Half Up')).toBeInTheDocument()
    expect(screen.queryByText('Amber Key')).not.toBeInTheDocument()
  })

  it('offers what the selected fixtures can take when the gesture names no attribute', () => {
    // Rows selected but no cells: there is no attribute in the gesture, so the filter is what the
    // heads *have* — every family they could take, none they could not.
    render(strip([], HEX_1, ['INTENSITY', 'COLOUR']))
    expect(screen.getByText('Amber Key')).toBeInTheDocument()
    expect(screen.getByText('Half Up')).toBeInTheDocument()
  })

  it('withholds a family the selected fixtures do not have', () => {
    // A dimmer-only par selected: the colour template would land nowhere, so it is not offered.
    render(strip([], HEX_1, ['INTENSITY']))
    expect(screen.getByText('Half Up')).toBeInTheDocument()
    expect(screen.queryByText('Amber Key')).not.toBeInTheDocument()
  })

  it('says so when nothing fits, rather than showing an empty strip', () => {
    render(strip([], HEX_1, ['POSITION']))
    expect(screen.getByText('No template fits what is selected.')).toBeInTheDocument()
  })

  it('shows the whole library when nothing is selected — there is no question yet', () => {
    render(strip([], [], []))
    expect(screen.getByText('Amber Key')).toBeInTheDocument()
    expect(screen.getByText('Half Up')).toBeInTheDocument()
  })

  it('offers both families when the marquee spans two columns', () => {
    render(
      strip([
        { rowId: 'fixture:hex-1', col: 'colour' },
        { rowId: 'fixture:hex-1', col: 'dimmer' },
      ]),
    )
    expect(screen.getByText('Amber Key')).toBeInTheDocument()
    expect(screen.getByText('Half Up')).toBeInTheDocument()
  })

  it('lands the press on the targets the container derived — the cells’ heads, not the checkboxes', () => {
    // Three colour cells on three heads: the container hands those three in, and every one of
    // them is sent, whatever the row selection names.
    const three: TemplateTarget[] = [
      { type: 'fixture', key: 'hex-1' },
      { type: 'fixture', key: 'hex-2' },
      { type: 'fixture', key: 'hex-3' },
    ]
    render(strip(COLOUR_CELL, three))
    fireEvent.click(screen.getByText('Amber Key'))
    expect(applyTemplate).toHaveBeenCalledWith({ projectId: 1, templateId: 1, targets: three })
  })

  it('click sets literal values — the apply route, never the toggle', () => {
    render(strip(COLOUR_CELL))
    fireEvent.click(screen.getByText('Amber Key'))
    expect(applyTemplate).toHaveBeenCalledWith({
      projectId: 1,
      templateId: 1,
      targets: [{ type: 'fixture', key: 'hex-1' }],
    })
    expect(toggleTemplate).not.toHaveBeenCalled()
  })

  it('⌥click adds a tracking layer, masked to the template’s family', () => {
    // The server derives the applied mask from the template's rows; this send is the belief this
    // client is acting on, which is what lets a disagreement surface in the response rather than
    // silently on the rig. Pinned because sending nothing would make that check unavailable.
    render(strip(COLOUR_CELL))
    fireEvent.click(screen.getByText('Amber Key'), { altKey: true })
    expect(toggleTemplate).toHaveBeenCalledWith({
      projectId: 1,
      templateId: 1,
      targets: [{ type: 'fixture', key: 'hex-1' }],
      propertyMask: 'COLOUR',
    })
    expect(applyTemplate).not.toHaveBeenCalled()
  })

  it('presses nothing without a selection — there is nowhere for it to land', () => {
    render(strip([], [], []))
    fireEvent.click(screen.getByText('Amber Key'))
    expect(applyTemplate).not.toHaveBeenCalled()
    expect(toggleTemplate).not.toHaveBeenCalled()
  })

  /**
   * The busk column's split, sideways: values, a hairline, then effects. The chips are one gesture
   * either way — the order is what says which half you are in, since the tooltip is the only other
   * thing that differs.
   */
  it('puts effect chips after the values, in library order', () => {
    templates = [BREATHE, AMBER]
    render(strip(COLOUR_CELL))
    const names = screen
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) => t !== 'New from selection')
    expect(names).toEqual(['Amber Key', 'Amber Breathe'])
  })

  it('click on an effect template mints copies, and says how many started', async () => {
    // The effect arm writes no literals at all: `written` stays 0 and `effectIds` is the whole
    // result, so without this the one gesture that reaches the rig hardest would say nothing.
    templates = [BREATHE]
    applyResult = { written: 0, skipped: [], effectIds: [11, 12] }
    render(strip(COLOUR_CELL))

    fireEvent.click(screen.getByText('Amber Breathe'))
    expect(applyTemplate).toHaveBeenCalledWith({
      projectId: 1,
      templateId: 3,
      targets: [{ type: 'fixture', key: 'hex-1' }],
    })
    expect(toggleTemplate).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('2 effects started'))
  })

  it('does not read a value press’s empty effectIds as a failed effect press', async () => {
    // The desk answers a value apply with `effectIds: []` too. That is not "nothing started" — no
    // effect was asked for — and warning about it put a red toast on every successful press.
    applyResult = { written: 3, skipped: [], effectIds: [] }
    render(strip(COLOUR_CELL))
    fireEvent.click(screen.getByText('Amber Key'))
    await vi.waitFor(() => expect(applyTemplate).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    expect(toastWarning).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('warns when an effect press started nothing', async () => {
    // An empty list looks exactly like a press that started everything, and this arm has no
    // `skipped` to say otherwise — only the count.
    templates = [BREATHE]
    applyResult = { written: 0, skipped: [], effectIds: [] }
    render(strip(COLOUR_CELL))

    fireEvent.click(screen.getByText('Amber Breathe'))
    await vi.waitFor(() =>
      expect(toastWarning).toHaveBeenCalledWith(
        'Nothing started — no selected head could take this effect',
      ),
    )
  })

  it('⌥click on an effect template adds a tracking layer like any other', () => {
    templates = [BREATHE]
    render(strip(COLOUR_CELL))
    fireEvent.click(screen.getByText('Amber Breathe'), { altKey: true })
    expect(toggleTemplate).toHaveBeenCalledWith({
      projectId: 1,
      templateId: 3,
      targets: [{ type: 'fixture', key: 'hex-1' }],
      propertyMask: 'COLOUR',
    })
    expect(applyTemplate).not.toHaveBeenCalled()
  })

  it('names a copy in the effect chip’s tooltip, because only the route says which happened', () => {
    templates = [BREATHE]
    render(strip(COLOUR_CELL))
    expect(screen.getByText('Amber Breathe').closest('button')).toHaveAttribute(
      'title',
      'Click to run a copy of “Amber Breathe” on the selection · ⌥click to add a layer that tracks it',
    )
  })

  it('disables New from selection without a selection, and enables it with one', () => {
    const { unmount } = render(strip([], [], []))
    expect(screen.getByText('New from selection').closest('button')).toBeDisabled()
    unmount()

    render(strip([]))
    const chip = screen.getByText('New from selection').closest('button')
    expect(chip).not.toBeDisabled()
    fireEvent.click(chip!)
    expect(screen.getByTestId('new-sheet')).toBeInTheDocument()
  })

  it('hands the sheet the same targets a press would use, and only the families the cells asked for', () => {
    // A marquee: the sheet records those heads and is told the family. Rows only: same heads, but
    // `families` is null — the capability list is the strip's filter, not the operator's choice,
    // and the sheet should ask rather than pre-pick one of several.
    render(strip(COLOUR_CELL))
    expect(newSheetProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ targets: HEX_1, families: ['COLOUR'] }),
    )
    cleanup()
    render(strip([], HEX_1, ['INTENSITY', 'COLOUR']))
    expect(newSheetProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ targets: HEX_1, families: null }),
    )
  })
})

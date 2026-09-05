// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TemplateSummary } from '@/api/templatesApi'

/**
 * The strip's two load-bearing behaviours: **the selection is the filter**, and **the two gestures
 * are two routes**.
 *
 * The filter is what makes the strip usable without a picker — select colour cells and only colour
 * templates are offered — so a regression there turns it back into a list of everything. And the
 * click/⌥click split is the difference between a literal and a dependency, which is invisible on
 * screen: only the route called says which happened.
 */
const applyTemplate = vi.fn()
const toggleTemplate = vi.fn()
let templates: TemplateSummary[] = []
let selectedKeys: string[] = []
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
vi.mock('react-redux', () => ({ useSelector: (fn: unknown) => (fn as () => unknown)() }))
// Partial: `store/index.ts` reads `selectionSlice.reducer` at module scope, so replacing the whole
// module wholesale takes the store down with it.
vi.mock('@/store/selectionSlice', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/selectionSlice')>()),
  selectTargetKeys: () => selectedKeys,
}))
vi.mock('./NewTemplateFromSelectionSheet', () => ({
  NewTemplateFromSelectionSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="new-sheet" /> : null,
}))

const { TemplateStrip } = await import('./TemplateStrip')

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
  selectedKeys = ['hex-1']
})
afterEach(cleanup)

describe('TemplateStrip', () => {
  it('offers only the families the selected cells name', () => {
    render(<TemplateStrip projectId={1} cells={[{ rowId: 'fixture:hex-1', col: 'colour' }]} />)
    expect(screen.getByText('Amber Key')).toBeInTheDocument()
    expect(screen.queryByText('Half Up')).not.toBeInTheDocument()
  })

  it('follows the selection when it moves to another column', () => {
    render(<TemplateStrip projectId={1} cells={[{ rowId: 'fixture:hex-1', col: 'dimmer' }]} />)
    expect(screen.getByText('Half Up')).toBeInTheDocument()
    expect(screen.queryByText('Amber Key')).not.toBeInTheDocument()
  })

  it('offers everything when the gesture names no attribute', () => {
    // Rows selected but no cells: there is no attribute in the gesture, so guessing one would hide
    // templates the operator can legitimately apply.
    render(<TemplateStrip projectId={1} cells={[]} />)
    expect(screen.getByText('Amber Key')).toBeInTheDocument()
    expect(screen.getByText('Half Up')).toBeInTheDocument()
  })

  it('offers both families when the marquee spans two columns', () => {
    render(
      <TemplateStrip
        projectId={1}
        cells={[
          { rowId: 'fixture:hex-1', col: 'colour' },
          { rowId: 'fixture:hex-1', col: 'dimmer' },
        ]}
      />,
    )
    expect(screen.getByText('Amber Key')).toBeInTheDocument()
    expect(screen.getByText('Half Up')).toBeInTheDocument()
  })

  it('click sets literal values — the apply route, never the toggle', () => {
    render(<TemplateStrip projectId={1} cells={[{ rowId: 'fixture:hex-1', col: 'colour' }]} />)
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
    render(<TemplateStrip projectId={1} cells={[{ rowId: 'fixture:hex-1', col: 'colour' }]} />)
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
    selectedKeys = []
    render(<TemplateStrip projectId={1} cells={[{ rowId: 'fixture:hex-1', col: 'colour' }]} />)
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
    render(<TemplateStrip projectId={1} cells={[{ rowId: 'fixture:hex-1', col: 'colour' }]} />)
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
    render(<TemplateStrip projectId={1} cells={[{ rowId: 'fixture:hex-1', col: 'colour' }]} />)

    fireEvent.click(screen.getByText('Amber Breathe'))
    expect(applyTemplate).toHaveBeenCalledWith({
      projectId: 1,
      templateId: 3,
      targets: [{ type: 'fixture', key: 'hex-1' }],
    })
    expect(toggleTemplate).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('2 effects started'))
  })

  it('warns when an effect press started nothing', async () => {
    // An empty list looks exactly like a press that started everything, and this arm has no
    // `skipped` to say otherwise — only the count.
    templates = [BREATHE]
    applyResult = { written: 0, skipped: [], effectIds: [] }
    render(<TemplateStrip projectId={1} cells={[{ rowId: 'fixture:hex-1', col: 'colour' }]} />)

    fireEvent.click(screen.getByText('Amber Breathe'))
    await vi.waitFor(() =>
      expect(toastWarning).toHaveBeenCalledWith(
        'Nothing started — no selected head could take this effect',
      ),
    )
  })

  it('⌥click on an effect template adds a tracking layer like any other', () => {
    templates = [BREATHE]
    render(<TemplateStrip projectId={1} cells={[{ rowId: 'fixture:hex-1', col: 'colour' }]} />)
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
    render(<TemplateStrip projectId={1} cells={[{ rowId: 'fixture:hex-1', col: 'colour' }]} />)
    expect(screen.getByText('Amber Breathe').closest('button')).toHaveAttribute(
      'title',
      'Click to run a copy of “Amber Breathe” on the selection · ⌥click to add a layer that tracks it',
    )
  })

  it('disables New from selection without a selection, and enables it with one', () => {
    selectedKeys = []
    const { unmount } = render(<TemplateStrip projectId={1} cells={[]} />)
    expect(screen.getByText('New from selection').closest('button')).toBeDisabled()
    unmount()

    selectedKeys = ['hex-1']
    render(<TemplateStrip projectId={1} cells={[]} />)
    const chip = screen.getByText('New from selection').closest('button')
    expect(chip).not.toBeDisabled()
    fireEvent.click(chip!)
    expect(screen.getByTestId('new-sheet')).toBeInTheDocument()
  })
})

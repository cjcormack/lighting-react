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

vi.mock('@/store/templates', () => ({
  useTemplateListQuery: () => ({ data: templates }),
  useApplyTemplateMutation: () => [
    (args: unknown) => {
      applyTemplate(args)
      return { unwrap: () => Promise.resolve({ written: 1, skipped: [] }) }
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
    sortOrder: 0,
    fadeDurationMs: null,
    family: 'COLOUR',
    isGeneric: true,
    rows: [
      { targetType: 'deferred', targetKey: '', propertyName: 'rgbColour', value: '#FF9D4A;policy=extract' },
    ],
    kind: 'value',
    effect: null,
    layerCount: 0,
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

beforeEach(() => {
  applyTemplate.mockClear()
  toggleTemplate.mockClear()
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

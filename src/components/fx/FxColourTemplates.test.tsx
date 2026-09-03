// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { TemplateSummary } from '@/api/templatesApi'

/**
 * Which templates an FX colour parameter may name, and what a reference is drawn as.
 *
 * Three exclusions decide the offer, and all three are silent when they misfire: a template that
 * should be offerable and isn't simply doesn't appear, with nothing to say why. They are asserted
 * one at a time here, from a base template that passes all three, so a regression names the clause
 * it broke.
 *
 * `labelFor`'s three-way split is the other half. "Not loaded yet" and "gone" look identical from
 * this side — both are a uuid that matches nothing — and only one of them is worth telling the
 * operator about, so the distinction is `isLoading` and nothing else.
 */

let templates: TemplateSummary[] = []
let isLoading = false
const listQuery = vi.fn()

vi.mock('@/store/templates', () => ({
  useTemplateListQuery: (args: unknown, options?: unknown) => {
    listQuery(args, options)
    return { data: templates, isLoading }
  },
  useCreateTemplateMutation: () => [vi.fn(), { isLoading: false }],
}))

const { useColourTemplates } = await import('./FxColourTemplates')

function template(over: Partial<TemplateSummary> = {}): TemplateSummary {
  return {
    id: 1,
    uuid: 'u1',
    name: 'Warm Key',
    notes: null,
    sortOrder: 0,
    groupId: null,
    fadeDurationMs: null,
    family: 'COLOUR',
    isGeneric: true,
    rows: [
      { targetType: 'deferred', targetKey: '', propertyName: 'rgbColour', value: '#ff9d4a;policy=extract' },
    ],
    kind: 'value',
    effect: null,
    layerCount: 0,
    ...over,
  }
}

const WARM = template()
const REF = 'tmpl:u1'

/** Mounted under a project, which is what `useColourTemplates` reads the route for. */
function render() {
  return renderHook(() => useColourTemplates(), {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={['/projects/7/show']}>
        <Routes>
          <Route path="/projects/:projectId/show" element={children} />
        </Routes>
      </MemoryRouter>
    ),
  })
}

afterEach(() => {
  templates = []
  isLoading = false
  listQuery.mockClear()
})

describe('useColourTemplates offerability', () => {
  it('offers a generic single-row colour template', () => {
    templates = [WARM]
    expect(render().result.current.templates.map((t) => t.name)).toEqual(['Warm Key'])
  })

  it('excludes a template that is not the COLOUR family', () => {
    templates = [template({ family: 'INTENSITY' })]
    expect(render().result.current.templates).toEqual([])
  })

  it('excludes a per-fixture template', () => {
    // An effect's colour output is one colour applied to every head it targets, so there is nothing
    // for it to take from a template holding a different colour per head.
    templates = [template({ isGeneric: false })]
    expect(render().result.current.templates).toEqual([])
  })

  it('excludes a multi-row template', () => {
    // Everything downstream reads `rows[0]` — the swatch, the chip's tooltip — so a second row
    // would be silently ignored under a name that claims to cover it.
    templates = [
      template({
        rows: [
          { targetType: 'deferred', targetKey: '', propertyName: 'rgbColour', value: '#ff9d4a' },
          { targetType: 'deferred', targetKey: '', propertyName: 'rgbColour', value: '#4a9dff' },
        ],
      }),
    ]
    expect(render().result.current.templates).toEqual([])
  })

  it('excludes an effect template — an effect is not a colour', () => {
    // fx-templates D12, and pinned rather than left to the row count that currently implements it:
    // an effect template holds no rows, so it is excluded today by `rows.length === 1`. This is the
    // assertion that fails if that clause is ever relaxed without an explicit kind check.
    templates = [template({ id: 9, uuid: 'u9', name: 'Amber Breathe', kind: 'effect', rows: [] })]
    expect(render().result.current.templates).toEqual([])
  })

  it('skips the query entirely outside a project', () => {
    renderHook(() => useColourTemplates(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    expect(listQuery).toHaveBeenCalledWith(expect.anything(), { skip: true })
  })
})

describe('useColourTemplates lookups', () => {
  it('labels a resolved reference with the template name', () => {
    templates = [WARM]
    expect(render().result.current.labelFor(REF)).toBe('Warm Key')
  })

  it('says loading rather than missing while the library is still arriving', () => {
    isLoading = true
    expect(render().result.current.labelFor(REF)).toBe('Loading…')
  })

  it('says missing once the library has arrived without it', () => {
    templates = [template({ uuid: 'somethingelse' })]
    expect(render().result.current.labelFor(REF)).toBe('Missing template')
  })

  it('resolves a reference to the swatch of its only row, and a literal to nothing', () => {
    templates = [WARM]
    const { result } = render()
    expect(result.current.swatchFor(REF)).toBe('#ff9d4a')
    expect(result.current.swatchFor('#123456')).toBeNull()
    expect(result.current.templateFor('#123456')).toBeNull()
  })

  it('resolves nothing for a reference to a template that exists but is not offerable', () => {
    // The lookups read the *filtered* list, so an excluded template is not reachable by uuid
    // either — a picker cannot draw a reference it would never have offered.
    templates = [template({ isGeneric: false })]
    const { result } = render()
    expect(result.current.templateFor(REF)).toBeNull()
    expect(result.current.swatchFor(REF)).toBeNull()
  })
})

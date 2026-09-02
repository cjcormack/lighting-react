// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TemplateSummary } from '@/api/templatesApi'

/**
 * The template library's two structural claims: the **sticky family filter** is the page's only
 * partition, and **`?family=` deep-links** into it.
 *
 * Both moved here from `/looks` in session 3 along with the argument for them, so these are the
 * assertions that used to belong to that page — and they matter more here, because on `/templates` a
 * family really is an exact partition of the library.
 */
let templates: TemplateSummary[] = []

vi.mock('@/store/templates', () => ({
  useTemplateListQuery: () => ({ data: templates, isLoading: false }),
  useCreateTemplateMutation: () => [vi.fn(), { isLoading: false }],
  useSaveTemplateMutation: () => [vi.fn(), { isLoading: false }],
  useDeleteTemplateMutation: () => [vi.fn(), { isLoading: false }],
}))
vi.mock('@/store/projects', () => ({
  useCurrentProjectQuery: () => ({ data: { id: 1, name: 'Hamlet' }, isLoading: false }),
  useProjectQuery: () => ({ data: { id: 1, name: 'Hamlet' }, isLoading: false }),
}))
vi.mock('@/components/templates/TemplateEditor', () => ({
  TemplateEditor: ({ open }: { open: boolean }) => (open ? <div data-testid="editor" /> : null),
}))
vi.mock('@/components/Breadcrumbs', () => ({ Breadcrumbs: () => null }))

const { ProjectTemplates } = await import('./Templates')

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

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/projects/:projectId/templates" element={<ProjectTemplates />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  templates = [
    template(),
    template({
      id: 2,
      uuid: 'u2',
      name: 'Half Up',
      family: 'INTENSITY',
      rows: [{ targetType: 'deferred', targetKey: '', propertyName: 'dimmer', value: 'pct:50' }],
    }),
    template({
      id: 3,
      uuid: 'u3',
      name: 'Downstage Centre',
      family: 'POSITION',
      isGeneric: false,
      rows: [
        { targetType: 'fixture', targetKey: 'mover-1', propertyName: 'position', value: 'deg:12,-8' },
        { targetType: 'fixture', targetKey: 'mover-2', propertyName: 'position', value: 'deg:-14,-8' },
      ],
    }),
  ]
})
afterEach(cleanup)

describe('ProjectTemplates', () => {
  it('lists every template unfiltered', () => {
    renderAt('/projects/1/templates')
    expect(screen.getByText('Amber Key')).toBeInTheDocument()
    expect(screen.getByText('Half Up')).toBeInTheDocument()
    expect(screen.getByText('Downstage Centre')).toBeInTheDocument()
  })

  it('lands filtered from a ?family= deep link', () => {
    // Cmd+K's four per-family entries are query params on this one route, so arriving by link has to
    // filter — `navigation.test.ts` pins the links themselves.
    renderAt('/projects/1/templates?family=colour')
    expect(screen.getByText('Amber Key')).toBeInTheDocument()
    expect(screen.queryByText('Half Up')).not.toBeInTheDocument()
  })

  it('partitions exactly — every template is in one family and no other', () => {
    renderAt('/projects/1/templates?family=position')
    expect(screen.getByText('Downstage Centre')).toBeInTheDocument()
    expect(screen.queryByText('Amber Key')).not.toBeInTheDocument()
    expect(screen.queryByText('Half Up')).not.toBeInTheDocument()
  })

  it('filters on a click and remembers the choice for next time', () => {
    const { unmount } = renderAt('/projects/1/templates')
    // By role, not by text: "Intensity" is also the family badge on the row below, so `getByText`
    // is ambiguous. The filter is a button and carries the label as its accessible name.
    fireEvent.click(screen.getByRole('button', { name: 'Intensity' }))
    expect(screen.getByText('Half Up')).toBeInTheDocument()
    expect(screen.queryByText('Amber Key')).not.toBeInTheDocument()
    unmount()

    // Sticky, so the sidebar's single row lands where you left it.
    renderAt('/projects/1/templates')
    expect(screen.getByText('Half Up')).toBeInTheDocument()
    expect(screen.queryByText('Amber Key')).not.toBeInTheDocument()
  })

  it('says which shape each template is, because applying them differs', () => {
    // A per-fixture template applied to a head it holds no entry for asserts nothing for that head,
    // so the row has to say which it is.
    renderAt('/projects/1/templates')
    expect(screen.getByText(/Generic · any fixture with colour/)).toBeInTheDocument()
    expect(screen.getByText(/Per fixture · 2 heads/)).toBeInTheDocument()
  })

  it('offers New template — a template is authored, not captured', () => {
    // The line D9 draws: cues and Looks are recorded and so have no create button; templates,
    // separators and stacks are not captured states and keep theirs.
    renderAt('/projects/1/templates')
    fireEvent.click(screen.getByText('New template'))
    expect(screen.getByTestId('editor')).toBeInTheDocument()
  })

  it('opens the editor from ?action=new, for the command palette', () => {
    renderAt('/projects/1/templates?action=new')
    expect(screen.getByTestId('editor')).toBeInTheDocument()
  })

  it('shows the empty state rather than a blank page', () => {
    templates = []
    renderAt('/projects/1/templates')
    expect(screen.getByText(/No templates yet/)).toBeInTheDocument()
  })
})

// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import type { PadItem } from './EffectPad'
import { EffectPad, templateSwatch } from './EffectPad'
import type { TemplateSummary } from '@/api/templatesApi'

vi.mock('@/store/status', () => ({ useIsDeskConnected: () => true }))

afterEach(cleanup)

/**
 * The four family columns of the Templates pool.
 *
 * Reached through the section's heading rather than by a bare `.grid` selector: several grids share
 * the scroller now, and one that matched by position would silently start asserting about a
 * different pool the next time the layout moves.
 */
function templateColumns(container: HTMLElement): Element[] {
  const heading = within(container).getByText('Templates').closest('div')?.parentElement
  const grid = heading?.querySelector('.grid')
  return grid ? [...grid.children] : []
}

function pad(overrides: Partial<PadItem> & Pick<PadItem, 'key' | 'name'>): PadItem {
  return {
    notes: null,
    detail: '',
    kind: 'template',
    family: null,
    swatch: null,
    presence: 'none',
    onToggle: () => {},
    onEdit: () => {},
    ...overrides,
  }
}

function draw(padItems: PadItem[], hasSelection = true) {
  return render(
    <MemoryRouter>
      <EffectPad
        effectsByCategory={{}}
        getPresence={() => 'none'}
        onToggle={() => {}}
        onLongPress={() => {}}
        hasSelection={hasSelection}
        padItems={padItems}
        currentProjectId={7}
        defaultBeatDivision={1}
        onBeatDivisionChange={() => {}}
        propertyButtons={[]}
        getPropertyPresence={() => 'none'}
        onPropertyToggle={() => {}}
        onPropertyLongPress={() => {}}
        getPropertyValue={() => null}
      />
    </MemoryRouter>,
  )
}

/**
 * The four family columns are an *exact partition*: a template is in exactly one family, derived
 * from its rows and validated at the write boundary. That is the same fact that put the family
 * filter on `/templates` and kept it off `/looks`, and it is why a column can be the pad's home
 * rather than a filter over one flat grid.
 */
describe('the template pool columns', () => {
  it('files each template under its own family', () => {
    const { container } = draw([
      pad({ key: 't1', name: 'Warm Amber', family: 'COLOUR' }),
      pad({ key: 't2', name: 'Drum Riser', family: 'POSITION' }),
      pad({ key: 't3', name: 'Tight Beam', family: 'BEAM' }),
      pad({ key: 't4', name: 'Key 75%', family: 'INTENSITY' }),
    ])

    // Colour first, the family a busking operator reaches for most — not `ATTRIBUTE_FAMILIES` order.
    // Scoped to the Templates section's own grid. A document-wide `.grid > div` also picks up the
    // Looks/cue-column split session 4 added, which is a different grid entirely.
    const columns = templateColumns(container)
    const headings = [...columns].map((c) => c.firstElementChild?.textContent)
    expect(headings).toEqual(['Colour', 'Position', 'Beam', 'Intensity'])

    for (const [heading, name] of [
      ['Colour', 'Warm Amber'],
      ['Position', 'Drum Riser'],
      ['Beam', 'Tight Beam'],
      ['Intensity', 'Key 75%'],
    ] as const) {
      const column = [...columns].find((c) => c.firstElementChild?.textContent === heading)!
      expect(within(column as HTMLElement).getByText(name)).toBeInTheDocument()
    }
  })

  it('keeps the four columns even when one is empty', () => {
    const { container } = draw([pad({ key: 't1', name: 'Warm Amber', family: 'COLOUR' })])
    expect(templateColumns(container)).toHaveLength(4)
  })

  /** A Look spans families by nature, so it has no column — it gets its own section instead. */
  it('puts Looks in their own section, not in a family column', () => {
    draw([pad({ key: 'l1', name: 'Ballyhoo', kind: 'look' })])
    expect(screen.getByText('Looks')).toBeInTheDocument()
    expect(screen.getByText('Ballyhoo')).toBeInTheDocument()
  })
})

describe('the pool with nothing selected', () => {
  /**
   * It used to be a centred "Select a group or fixture" page, which hid the whole library behind a
   * step the operator had not been shown. Seeing what there is to press is most of what makes a
   * pad grid learnable.
   */
  it('shows the library, dimmed and inert, with a hint rather than a blank page', () => {
    const { container } = draw([pad({ key: 't1', name: 'Warm Amber', family: 'COLOUR' })], false)

    expect(screen.getByText('Warm Amber')).toBeInTheDocument()
    expect(screen.getByText(/pads apply to the selection/)).toBeInTheDocument()
    // Inert on the *buttons*, never on the scroll container: `pointer-events-none` there takes
    // the container out of hit-testing, so the wheel and a touch drag find no scrollable
    // ancestor and the library cannot be read past its first screenful.
    const dimmed = container.querySelectorAll('[aria-disabled="true"]')
    expect(dimmed.length).toBeGreaterThan(0)
    for (const section of dimmed) {
      expect(section.className).toContain('[&_button]:pointer-events-none')
    }
    expect(container.firstElementChild?.className).not.toMatch(/(^|\s)pointer-events-none/)
  })

  /**
   * The dim is per pool, not over the whole scroller, and the cue column is why.
   *
   * Session 4 put the stack cards and pinned-cue pads in the same scroller. They answer to the
   * playhead, not to the target selection — GO must work with nothing selected — so a subtree-wide
   * rule would have made the transport inert for want of a fixture.
   */
  it('leaves the cue column live while the pools are dimmed', () => {
    const { container } = render(
      <MemoryRouter>
        <EffectPad
          effectsByCategory={{}}
          getPresence={() => 'none'}
          onToggle={() => {}}
          onLongPress={() => {}}
          hasSelection={false}
          padItems={[pad({ key: 't1', name: 'Warm Amber', family: 'COLOUR' })]}
          cueColumn={
            <div data-testid="cue-column">
              <button type="button">GO</button>
            </div>
          }
          currentProjectId={7}
          defaultBeatDivision={1}
          onBeatDivisionChange={() => {}}
          propertyButtons={[]}
          getPropertyPresence={() => 'none'}
          onPropertyToggle={() => {}}
          onPropertyLongPress={() => {}}
          getPropertyValue={() => null}
        />
      </MemoryRouter>,
    )

    const column = screen.getByTestId('cue-column')
    expect(column.closest('[aria-disabled="true"]')).toBeNull()
    expect(container.firstElementChild?.className).not.toContain('[&_button]:pointer-events-none')
  })
})

/**
 * The swatch's two exclusions, which are `isOfferable`'s in `components/fx/FxColourTemplates.tsx`
 * and not a coincidence: a per-fixture template holds one colour per head and a multi-row one
 * holds several, so in both cases `rows[0]` would state one colour under a name that covers more.
 */
describe('templateSwatch', () => {
  const colourRow = (value: string) => ({
    targetType: 'deferred' as const,
    targetKey: '',
    propertyName: 'rgbColour',
    value,
  })
  const template = (overrides: Partial<TemplateSummary>): TemplateSummary =>
    ({
      id: 1,
      uuid: 'u',
      name: 'Warm Amber',
      notes: null,
      sortOrder: 0,
      fadeDurationMs: null,
      family: 'COLOUR',
      isGeneric: true,
      rows: [colourRow('#FF9D4A;policy=extract')],
      layerCount: 0,
      ...overrides,
    }) as TemplateSummary

  it('resolves a generic single-row colour template', () => {
    expect(templateSwatch(template({}))).toBe('#FF9D4A')
  })

  it('refuses a per-fixture template — it holds one colour per head, not one colour', () => {
    expect(templateSwatch(template({ isGeneric: false }))).toBeNull()
  })

  it('refuses a multi-row template — rows[0] is not the whole of it', () => {
    expect(
      templateSwatch(
        template({ rows: [colourRow('#FF9D4A;policy=extract'), colourRow('#2B50FF')] }),
      ),
    ).toBeNull()
  })

  it('has nothing to draw for a non-colour intent', () => {
    expect(
      templateSwatch(
        template({
          family: 'INTENSITY',
          rows: [{ ...colourRow('pct:75'), propertyName: 'level' }],
        }),
      ),
    ).toBeNull()
  })
})

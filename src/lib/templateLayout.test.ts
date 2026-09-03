import { describe, expect, it } from 'vitest'
import type { TemplateGroup, TemplateSummary } from '@/api/templatesApi'
import {
  buildTemplateLayout,
  filterLayoutByFamily,
  groupBodyDragId,
  groupDragId,
  layoutToRequest,
  moveInLayout,
  parseDragId,
  templateDragId,
  type LayoutEntry,
} from './templateLayout'

function template(over: Partial<TemplateSummary> & Pick<TemplateSummary, 'id' | 'name'>): TemplateSummary {
  return {
    uuid: `u-${over.id}`,
    notes: null,
    sortOrder: 0,
    fadeDurationMs: null,
    groupId: null,
    family: 'COLOUR',
    isGeneric: true,
    kind: 'value',
    rows: [],
    effect: null,
    layerCount: 0,
    ...over,
  }
}

function group(over: Partial<TemplateGroup> & Pick<TemplateGroup, 'id' | 'name'>): TemplateGroup {
  return { uuid: `g-${over.id}`, sortOrder: 0, family: null, ...over }
}

/** The names in top-level order, a group rendered as `Name[member, member]`. */
function shape(layout: readonly LayoutEntry[]): string[] {
  return layout.map((entry) =>
    entry.kind === 'template'
      ? entry.template.name
      : `${entry.group.name}[${entry.templates.map((t) => t.name).join(', ')}]`,
  )
}

describe('buildTemplateLayout', () => {
  it('interleaves ungrouped templates and groups by sortOrder, members by their own', () => {
    const keys = group({ id: 10, name: 'Keys', sortOrder: 1 })
    const layout = buildTemplateLayout(
      [
        template({ id: 1, name: 'House', sortOrder: 0 }),
        template({ id: 2, name: 'Blue', sortOrder: 1, groupId: 10 }),
        template({ id: 3, name: 'Amber', sortOrder: 0, groupId: 10 }),
        template({ id: 4, name: 'Steel', sortOrder: 2 }),
      ],
      [keys],
    )
    expect(shape(layout)).toEqual(['House', 'Keys[Amber, Blue]', 'Steel'])
  })

  it('breaks a tie with template-before-group, then name — the server\'s own rule', () => {
    const layout = buildTemplateLayout(
      [
        template({ id: 2, name: 'Zed', sortOrder: 0 }),
        template({ id: 1, name: 'Alpha', sortOrder: 0 }),
      ],
      [group({ id: 10, name: 'Aardvark', sortOrder: 0 })],
    )
    expect(shape(layout)).toEqual(['Alpha', 'Zed', 'Aardvark[]'])
  })

  it('treats a template whose group is unknown as ungrouped', () => {
    // Two fetches, one group deleted between them: the members must not vanish from the page.
    const layout = buildTemplateLayout([template({ id: 1, name: 'Orphan', groupId: 99 })], [])
    expect(shape(layout)).toEqual(['Orphan'])
  })

  it('keeps an empty group', () => {
    const layout = buildTemplateLayout([], [group({ id: 10, name: 'Keys' })])
    expect(shape(layout)).toEqual(['Keys[]'])
  })
})

describe('layoutToRequest', () => {
  it('names every template once, groups with their members in order', () => {
    const layout = buildTemplateLayout(
      [
        template({ id: 1, name: 'House', sortOrder: 0 }),
        template({ id: 2, name: 'Blue', sortOrder: 1, groupId: 10 }),
        template({ id: 3, name: 'Amber', sortOrder: 0, groupId: 10 }),
      ],
      [group({ id: 10, name: 'Keys', sortOrder: 1 }), group({ id: 11, name: 'Empty', sortOrder: 2 })],
    )
    expect(layoutToRequest(layout)).toEqual([
      { templateId: 1 },
      { groupId: 10, templateIds: [3, 2] },
      { groupId: 11, templateIds: [] },
    ])
  })
})

describe('filterLayoutByFamily', () => {
  const layout = buildTemplateLayout(
    [
      template({ id: 1, name: 'Amber', family: 'COLOUR', sortOrder: 0 }),
      template({ id: 2, name: 'Downstage', family: 'POSITION', sortOrder: 1 }),
      template({ id: 3, name: 'Blue', family: 'COLOUR', groupId: 10 }),
    ],
    [group({ id: 10, name: 'Keys', sortOrder: 2 }), group({ id: 11, name: 'Empty', sortOrder: 3 })],
  )

  it('returns everything under ALL, empty groups included', () => {
    expect(shape(filterLayoutByFamily(layout, 'ALL'))).toEqual(['Amber', 'Downstage', 'Keys[Blue]', 'Empty[]'])
  })

  it('keeps a group under the family its members derive', () => {
    expect(shape(filterLayoutByFamily(layout, 'COLOUR'))).toEqual(['Amber', 'Keys[Blue]'])
  })

  it('hides an empty group under any family — it has nothing to file it under', () => {
    expect(shape(filterLayoutByFamily(layout, 'POSITION'))).toEqual(['Downstage'])
  })
})

describe('drag ids', () => {
  it('round-trip', () => {
    expect(parseDragId(templateDragId(7))).toEqual({ kind: 'template', id: 7 })
    expect(parseDragId(groupDragId(3))).toEqual({ kind: 'group', id: 3 })
    expect(parseDragId(groupBodyDragId(3))).toEqual({ kind: 'groupBody', id: 3 })
    expect(parseDragId('slot-4')).toBeNull()
  })
})

describe('moveInLayout', () => {
  const keys = group({ id: 10, name: 'Keys', sortOrder: 1 })
  const movers = group({ id: 11, name: 'Movers', sortOrder: 3 })
  const base = () =>
    buildTemplateLayout(
      [
        template({ id: 1, name: 'House', sortOrder: 0 }),
        template({ id: 2, name: 'Amber', sortOrder: 0, groupId: 10 }),
        template({ id: 3, name: 'Blue', sortOrder: 1, groupId: 10 }),
        template({ id: 4, name: 'Steel', sortOrder: 2 }),
        template({ id: 5, name: 'Downstage', family: 'POSITION', sortOrder: 0, groupId: 11 }),
      ],
      [keys, movers],
    )

  it('starts from the expected shape', () => {
    expect(shape(base())).toEqual(['House', 'Keys[Amber, Blue]', 'Steel', 'Movers[Downstage]'])
  })

  it('reorders two top-level templates, up lands before and down lands after', () => {
    const up = moveInLayout(base(), templateDragId(4), templateDragId(1))!
    expect(up.refused).toBeUndefined()
    expect(shape(up.layout)).toEqual(['Steel', 'House', 'Keys[Amber, Blue]', 'Movers[Downstage]'])

    const down = moveInLayout(base(), templateDragId(1), templateDragId(4))!
    expect(shape(down.layout)).toEqual(['Keys[Amber, Blue]', 'Steel', 'House', 'Movers[Downstage]'])
  })

  it('reorders a group among top-level entries', () => {
    const up = moveInLayout(base(), groupDragId(10), templateDragId(1))!
    expect(shape(up.layout)).toEqual(['Keys[Amber, Blue]', 'House', 'Steel', 'Movers[Downstage]'])

    const down = moveInLayout(base(), groupDragId(10), templateDragId(4))!
    expect(shape(down.layout)).toEqual(['House', 'Steel', 'Keys[Amber, Blue]', 'Movers[Downstage]'])
  })

  it('puts a template above a group when over its header', () => {
    const result = moveInLayout(base(), templateDragId(4), groupDragId(10))!
    expect(shape(result.layout)).toEqual(['House', 'Steel', 'Keys[Amber, Blue]', 'Movers[Downstage]'])
  })

  it('moves a template into a group at the hovered member', () => {
    const result = moveInLayout(base(), templateDragId(4), templateDragId(3))!
    expect(shape(result.layout)).toEqual(['House', 'Keys[Amber, Steel, Blue]', 'Movers[Downstage]'])
  })

  it('moves a template into a group at the end when over the group body', () => {
    const result = moveInLayout(base(), templateDragId(1), groupBodyDragId(10))!
    expect(shape(result.layout)).toEqual(['Keys[Amber, Blue, House]', 'Steel', 'Movers[Downstage]'])
  })

  it('moves a template out of a group to top level', () => {
    const result = moveInLayout(base(), templateDragId(2), templateDragId(4))!
    expect(shape(result.layout)).toEqual(['House', 'Keys[Blue]', 'Amber', 'Steel', 'Movers[Downstage]'])
  })

  it('reorders within a group in both directions', () => {
    const up = moveInLayout(base(), templateDragId(3), templateDragId(2))!
    expect(shape(up.layout)).toEqual(['House', 'Keys[Blue, Amber]', 'Steel', 'Movers[Downstage]'])

    const down = moveInLayout(base(), templateDragId(2), templateDragId(3))!
    expect(shape(down.layout)).toEqual(['House', 'Keys[Blue, Amber]', 'Steel', 'Movers[Downstage]'])
  })

  it('never nests a group: over a member or a body means over that group', () => {
    const overMember = moveInLayout(base(), groupDragId(11), templateDragId(2))!
    expect(shape(overMember.layout)).toEqual(['House', 'Movers[Downstage]', 'Keys[Amber, Blue]', 'Steel'])

    const overBody = moveInLayout(base(), groupDragId(11), groupBodyDragId(10))!
    expect(shape(overBody.layout)).toEqual(['House', 'Movers[Downstage]', 'Keys[Amber, Blue]', 'Steel'])
  })

  /**
   * A group only ever moves at the top level, so a hovered *member*'s index within its group is
   * the wrong number to judge direction by. Reading it there put a group dropped on the first
   * member of a group below it *above* that group instead of below.
   */
  it('judges a group\'s direction by the target\'s top-level slot, not a member index', () => {
    const keysOnly = group({ id: 10, name: 'Keys', sortOrder: 0 })
    const moversOnly = group({ id: 11, name: 'Movers', sortOrder: 2 })
    const layout = buildTemplateLayout(
      [
        template({ id: 1, name: 'House', sortOrder: 1 }),
        template({ id: 5, name: 'Downstage', family: 'POSITION', sortOrder: 0, groupId: 11 }),
      ],
      [keysOnly, moversOnly],
    )
    expect(shape(layout)).toEqual(['Keys[]', 'House', 'Movers[Downstage]'])

    const down = moveInLayout(layout, groupDragId(10), templateDragId(5))!
    expect(shape(down.layout)).toEqual(['House', 'Movers[Downstage]', 'Keys[]'])
  })

  it('refuses a family mismatch and leaves the layout alone', () => {
    const before = base()
    const viaBody = moveInLayout(before, templateDragId(1), groupBodyDragId(11))!
    expect(viaBody.refused).toBe('family')
    expect(shape(viaBody.layout)).toEqual(shape(before))

    const viaMember = moveInLayout(before, templateDragId(1), templateDragId(5))!
    expect(viaMember.refused).toBe('family')
    expect(shape(viaMember.layout)).toEqual(shape(before))
  })

  it('lets any family into an empty group', () => {
    const empty = group({ id: 12, name: 'Empty', sortOrder: 9 })
    const layout = buildTemplateLayout([template({ id: 5, name: 'Downstage', family: 'POSITION' })], [empty])
    const result = moveInLayout(layout, templateDragId(5), groupBodyDragId(12))!
    expect(shape(result.layout)).toEqual(['Empty[Downstage]'])
  })

  it('in the over phase, crosses containers once and then holds still', () => {
    // The hover that carries Steel into Keys moves it; every later hover inside Keys is the
    // SortableContext's to preview, so the reducer answers null rather than oscillating.
    const once = moveInLayout(base(), templateDragId(4), templateDragId(3), 'over')!
    expect(shape(once.layout)).toEqual(['House', 'Keys[Amber, Steel, Blue]', 'Movers[Downstage]'])
    expect(moveInLayout(once.layout, templateDragId(4), templateDragId(3), 'over')).toBeNull()
    expect(moveInLayout(once.layout, templateDragId(4), templateDragId(2), 'over')).toBeNull()
    // Back out to the top level is a crossing again.
    const out = moveInLayout(once.layout, templateDragId(4), templateDragId(1), 'over')!
    expect(shape(out.layout)).toEqual(['Steel', 'House', 'Keys[Amber, Blue]', 'Movers[Downstage]'])
  })

  it('in the over phase, a same-container reorder is left to the drop', () => {
    expect(moveInLayout(base(), templateDragId(1), templateDragId(4), 'over')).toBeNull()
    expect(moveInLayout(base(), groupDragId(10), templateDragId(4), 'over')).toBeNull()
  })

  it('answers null for a no-op or a foreign id', () => {
    expect(moveInLayout(base(), templateDragId(1), templateDragId(1))).toBeNull()
    expect(moveInLayout(base(), 'slot-1', templateDragId(1))).toBeNull()
    expect(moveInLayout(base(), groupBodyDragId(10), templateDragId(1))).toBeNull()
  })
})

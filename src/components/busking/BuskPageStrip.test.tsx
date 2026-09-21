// @vitest-environment jsdom
import { Provider } from 'react-redux'
import { DndContext } from '@dnd-kit/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { store } from '@/store'
import type { BuskPage } from '@/api/buskApi'
import { resetBuskPageFollowStores, unlinkBuskPage } from '@/lib/buskPageFollow'
import { resetDeskFollowStores, unlinkFromDesk } from '@/lib/deskFollow'
import {
  BuskPageStrip,
  PAD_CHIP_SUBJECT_CLASS,
  PAD_EDIT_WORD_CLASS,
  PAD_FOCUS_WORD_CLASS,
  PAD_LABEL_CLASS,
  PAD_ROW_FLOOR_PX,
  PAD_SECOND_ROW_CLASS,
  PAD_TWO_ROWS_CLASS,
  PAD_VERB_WORD_CLASS,
  type BuskPageStripProps,
  type PadRowSelection,
} from './BuskPageStrip'
import type { BuskingTarget } from './buskingTypes'
import type { SelectionVerbs } from './selectionVerbs'
import type { Fixture } from '@/store/fixtures'

const programmer = { blind: false }
vi.mock('@/hooks/useProgrammerBlind', () => ({ useProgrammerBlind: () => programmer.blind }))

/**
 * The pad row (busk-chrome plan session A.5, D17–D20): in Pads on the desk board the body's top
 * row, carrying the `PADS` label, the tabs at the rig row's control size, the three selection verbs
 * pressing the host's handlers, the summary in the gap, the family pill and the page chip only
 * while unlinked, then the host's controls; in Split the tabs and the page chip only. Its folds
 * are its own ladder of the rig row's shape.
 */
const pages: BuskPage[] = [
  { id: 4, uuid: 'p4', name: 'Ballads', sortOrder: 0, rows: [] },
  { id: 5, uuid: 'p5', name: 'Dance', sortOrder: 1, rows: [] },
]

const par: Fixture = {
  key: 'par-1',
  name: 'PAR 1',
  type: 'Generic PAR',
  groups: [],
  elements: [],
} as unknown as Fixture

/** The host's handlers as mocks: the verbs object, and each mock beside it for the assertions. */
function verbs() {
  const spread = vi.fn<() => void>()
  const locate = vi.fn<() => void>()
  const press = vi.fn<() => void>()
  const release = vi.fn<() => void>()
  const v: SelectionVerbs = {
    spread,
    locate: { press: locate, active: false, enabled: true, title: 'Locate the selection: white beam at centre', label: 'Locate' },
    highlight: { press, release, active: false, enabled: true },
  }
  return { v, spread, locate, press, release }
}

function padsOf(v: SelectionVerbs, families: PadRowSelection['families'] = null): PadRowSelection {
  const target: BuskingTarget = { type: 'fixture', key: 'par-1', fixture: par }
  return { selectedTargets: new Map([['fixture:par-1', target]]), families, verbs: v }
}

function draw(props: Partial<BuskPageStripProps> = {}) {
  return render(
    <Provider store={store}>
      <DndContext>
        <BuskPageStrip
          pages={pages}
          activePageId={4}
          editing={false}
          onSelect={() => {}}
          onCreate={() => Promise.resolve()}
          onRename={() => Promise.resolve()}
          onDelete={() => {}}
          onReorder={() => {}}
          {...props}
        />
      </DndContext>
    </Provider>,
  )
}

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
  resetBuskPageFollowStores()
  resetDeskFollowStores()
})

describe('the pad row', () => {
  it('in Pads is the label, the tabs, the three verbs, the summary, the pill, both chips, then the host’s controls (D17)', () => {
    unlinkBuskPage(4)
    unlinkFromDesk({ targets: [], families: null })
    draw({ pads: padsOf(verbs().v, ['COLOUR']), controls: <button type="button">Focus here</button> })
    const row = document.querySelector('[data-pad-row="pads"]') as HTMLElement
    expect(row).not.toBeNull()
    const order = [...row.querySelectorAll('button, [data-pad-summary], [data-pad-family]')].map(
      (el) => el.getAttribute('aria-label') ?? el.textContent,
    )
    expect(order).toEqual([
      'Ballads', 'Dance',
      'Spread…', 'Locate', 'Highlight',
      'PAR 1 · 1 head', 'Colour', 'Targets: This window', 'Page: This window', 'Focus here',
    ])
    // The label is the row's first thing, and folds by its rung.
    const label = screen.getByText('Pads', { selector: 'div' })
    expect(label.className).toContain(PAD_LABEL_CLASS)
    expect(row.querySelector('[data-pad-row-tabs]')!.firstElementChild).toBe(label)
    // No Cells menu, no steps, no Clear: those act on tiles.
    expect(within(row).queryByRole('button', { name: /^Cells:/ })).toBeNull()
    expect(within(row).queryByRole('button', { name: 'Clear' })).toBeNull()
    expect(within(row).queryByRole('button', { name: /along the rig/ })).toBeNull()
    // The controls end the state group.
    const state = row.querySelector('[data-pad-row-state]') as HTMLElement
    expect(state.lastElementChild).toHaveTextContent('Focus here')
    expect(state.className).toContain('flex-1')
  })

  it('draws the amber BLIND pill after the family pill in Pads only while the programmer is blind, and never in Split', () => {
    unlinkBuskPage(4)
    unlinkFromDesk({ targets: [], families: null })
    draw({ pads: padsOf(verbs().v, ['COLOUR']), controls: <button type="button">Focus here</button> })
    expect(document.querySelector('[data-busk-blind]')).toBeNull()
    cleanup()

    programmer.blind = true
    try {
      draw({ pads: padsOf(verbs().v, ['COLOUR']), controls: <button type="button">Focus here</button> })
      const row = document.querySelector('[data-pad-row="pads"]') as HTMLElement
      const pill = row.querySelector('[data-busk-blind]') as HTMLElement
      expect(pill).toHaveTextContent('Blind')
      expect(pill.tagName).not.toBe('BUTTON')
      // Its word folds on the pad row's Focus-words rung, and it may give before a control moves.
      expect(pill.querySelector('[data-busk-blind-word]')!.className).toContain(PAD_FOCUS_WORD_CLASS)
      expect(pill.className).toMatch(/(^| )shrink( |$)/)
      const order = [...row.querySelectorAll('button, [data-pad-summary], [data-pad-family], [data-busk-blind]')].map(
        (el) => el.getAttribute('aria-label') ?? el.textContent,
      )
      expect(order).toEqual([
        'Ballads', 'Dance',
        'Spread…', 'Locate', 'Highlight',
        'PAR 1 · 1 head', 'Colour', 'Blind', 'Targets: This window', 'Page: This window', 'Focus here',
      ])
      cleanup()
      // In Split and Rig the rig row carries it; the pad row does not repeat it.
      draw({ controls: <button type="button">Focus here</button> })
      expect(document.querySelector('[data-pad-row="split"]')).not.toBeNull()
      expect(document.querySelector('[data-busk-blind]')).toBeNull()
    } finally {
      programmer.blind = false
    }
  })

  it('in Split is the tabs and the page chip only — no label, no verbs, no summary, no desk chip, and the host’s controls still at the end', () => {
    unlinkBuskPage(4)
    unlinkFromDesk({ targets: [], families: null })
    draw({ controls: <button type="button">Sheet</button> })
    const row = document.querySelector('[data-pad-row="split"]') as HTMLElement
    expect(row).not.toBeNull()
    const order = [...row.querySelectorAll('button, [data-pad-summary], [data-pad-family]')].map(
      (el) => el.getAttribute('aria-label') ?? el.textContent,
    )
    expect(order).toEqual(['Ballads', 'Dance', 'Page: This window', 'Sheet'])
    expect(row.querySelector('[data-pad-summary]')).toBeNull()
    // The label is Pads' — a `div`, which the order above cannot see, so it is asked for by name.
    expect(screen.queryByText('Pads', { selector: 'div' })).toBeNull()
    // The desk chip is the rig row's here.
    expect(screen.queryByRole('button', { name: /^Targets:/ })).toBeNull()
    // Split wraps as it always did, for edit mode's name field; the Pads ladder is not applied,
    // and the tabs group is capped to the row and wraps within it, so the name field can break.
    expect(row.className).toMatch(/(^| )flex-wrap( |$)/)
    expect(row.className).not.toContain(PAD_TWO_ROWS_CLASS)
    const tabs = row.querySelector('[data-pad-row-tabs]') as HTMLElement
    expect(tabs.className).toContain('max-w-full')
    expect(tabs.className).toMatch(/(^| )flex-wrap( |$)/)
  })

  it('presses the host’s handlers from the three verbs, with the band’s aria-labels', () => {
    const mocks = verbs()
    draw({ pads: padsOf(mocks.v) })
    fireEvent.click(screen.getByRole('button', { name: 'Spread…' }))
    expect(mocks.spread).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Locate' }))
    expect(mocks.locate).toHaveBeenCalledTimes(1)
    const highlight = screen.getByRole('button', { name: 'Highlight' })
    fireEvent.pointerDown(highlight)
    expect(mocks.press).toHaveBeenCalledTimes(1)
    fireEvent.pointerUp(highlight)
    expect(mocks.release).toHaveBeenCalledTimes(1)
    // Each verb's word folds by the pad row's own rung, not the rig row's.
    for (const name of ['Spread…', 'Locate', 'Highlight']) {
      const word = [...screen.getByRole('button', { name }).querySelectorAll('span')].find((el) => el.textContent === name)!
      expect(word.className).toBe(PAD_VERB_WORD_CLASS)
    }
  })

  it('draws the summary only in Pads, in the gap, truncating with the whole text on its title', () => {
    draw({ pads: padsOf(verbs().v) })
    const summary = document.querySelector('[data-pad-summary]') as HTMLElement
    expect(summary).toHaveTextContent('PAR 1 · 1 head')
    expect(summary).toHaveAttribute('title', 'PAR 1 · 1 head')
    expect(summary.className).toContain('min-w-0')
    expect(summary.className).toContain('truncate')
    expect(summary.className).toContain('flex-1')
    cleanup()
    draw()
    expect(document.querySelector('[data-pad-summary]')).toBeNull()
  })

  it('draws the family pill only while a mask is set, and only in Pads', () => {
    draw({ pads: padsOf(verbs().v, ['COLOUR', 'POSITION']) })
    expect(document.querySelector('[data-pad-family]')).toHaveTextContent('Colour · Position')
    cleanup()
    draw({ pads: padsOf(verbs().v, null) })
    expect(document.querySelector('[data-pad-family]')).toBeNull()
    cleanup()
    draw()
    expect(document.querySelector('[data-pad-family]')).toBeNull()
  })

  it('draws the page chip only while this window’s page is unlinked, in every shape (D18)', () => {
    draw({ pads: padsOf(verbs().v) })
    expect(screen.queryByRole('button', { name: /^Page:/ })).toBeNull()
    cleanup()
    draw()
    expect(screen.queryByRole('button', { name: /^Page:/ })).toBeNull()
    cleanup()
    unlinkBuskPage(4)
    draw({ pads: padsOf(verbs().v) })
    const chip = screen.getByRole('button', { name: 'Page: This window' })
    expect(chip.className).toContain('border-dashed')
    // It may give: `min-w-0 shrink`, both words, and its subject folds at the row's rung (D19).
    expect(chip.className).toMatch(/(^| )shrink( |$)/)
    expect(chip.className).toContain('min-w-0')
    expect(chip.querySelector('[data-pill-subject]')!.className).toContain(PAD_CHIP_SUBJECT_CLASS)
    cleanup()
    draw()
    expect(screen.getByRole('button', { name: 'Page: This window' })).toBeInTheDocument()
    // Not with no pages: a click there would spend the arrival decision on nothing.
    cleanup()
    draw({ pages: [], activePageId: null })
    expect(screen.queryByRole('button', { name: /^Page:/ })).toBeNull()
  })

  it('sizes the tabs to the rig row’s controls: a 28px group of 24px text-xs items', () => {
    draw({ pads: padsOf(verbs().v) })
    const group = document.querySelector('[data-busk-page-tabs]') as HTMLElement
    expect(group.className).toContain('h-7')
    expect(group.className).toContain('p-0.5')
    for (const name of ['Ballads', 'Dance']) {
      const tab = screen.getByRole('button', { name })
      expect(tab.className).toContain('h-6')
      expect(tab.className).toContain('px-2')
      expect(tab.className).toContain('text-xs')
    }
    expect(screen.getByRole('button', { name: 'Ballads' })).toHaveAttribute('aria-current', 'page')
    // The merged row keeps its own, smaller, form.
    cleanup()
    draw({ dense: true })
    expect((document.querySelector('[data-busk-page-tabs]') as HTMLElement).className).toContain('p-px')
    expect(screen.getByRole('button', { name: 'Ballads' }).className).toContain('py-0.5')
  })

  it('folds in the rig row’s order — verbs’ and Edit layout’s words, then the Focus words and the chip’s subject, then the label — and is two rows under its own floor, with the words back as closed ranges (D15, D19, D20)', () => {
    const rung = (cls: string) => Number(cls.match(/@\[(\d+)px\]/)![1])
    const range = (cls: string) => {
      const m = cls.match(/@min-\[(\d+)px\]:@max-\[(\d+)px\]:(\S+)/)
      expect(m, cls).not.toBeNull()
      return { from: Number(m![1]), to: Number(m![2]), utility: m![3] }
    }
    expect(rung(PAD_VERB_WORD_CLASS)).toBeGreaterThan(rung(PAD_FOCUS_WORD_CLASS))
    expect(rung(PAD_EDIT_WORD_CLASS)).toBe(rung(PAD_VERB_WORD_CLASS))
    expect(rung(PAD_CHIP_SUBJECT_CLASS)).toBe(rung(PAD_FOCUS_WORD_CLASS))
    expect(rung(PAD_FOCUS_WORD_CLASS)).toBeGreaterThan(rung(PAD_LABEL_CLASS))
    expect(rung(PAD_LABEL_CLASS)).toBeGreaterThan(PAD_ROW_FLOOR_PX)
    expect(PAD_LABEL_CLASS).toMatch(/^hidden @\[\d+px\]:block$/)
    for (const cls of [PAD_VERB_WORD_CLASS, PAD_EDIT_WORD_CLASS, PAD_FOCUS_WORD_CLASS, PAD_CHIP_SUBJECT_CLASS]) {
      const { from, to, utility } = range(cls)
      expect(to).toBe(PAD_ROW_FLOOR_PX)
      expect(from).toBeLessThan(to)
      expect(utility).toBe('inline')
      expect(cls).toMatch(/^hidden @\[\d+px\]:inline @min-/)
    }
    // The floor, on the row: two groups, the second taking its whole line under it.
    draw({ pads: padsOf(verbs().v), controls: <button type="button">Focus here</button> })
    const row = document.querySelector('[data-pad-row="pads"]') as HTMLElement
    // **The `@container` is an ancestor of the row, never the row itself**: a query container is
    // the nearest ancestor container, so a floor class on the container element has nothing to
    // match and never fires — which jsdom cannot show, so the structure is pinned here.
    expect(row.className).not.toContain('@container')
    const container = row.parentElement as HTMLElement
    expect(container.className).toContain('@container')
    expect(container).toHaveAttribute('data-busk-page-strip', 'open')
    // The gutter is the container's, so its content box is the row's and the rungs read it.
    expect(container.className).toContain('px-4')
    expect(row.className).not.toContain('px-4')
    expect(PAD_TWO_ROWS_CLASS).toMatch(/^@max-\[\d+px\]:flex-wrap$/)
    expect(PAD_SECOND_ROW_CLASS).toMatch(/^@max-\[\d+px\]:basis-full$/)
    expect(Number(PAD_TWO_ROWS_CLASS.match(/\d+/)![0])).toBe(PAD_ROW_FLOOR_PX)
    expect(row.className).toContain(PAD_TWO_ROWS_CLASS)
    expect(row.className).not.toMatch(/(^| )flex-wrap( |$)/)
    const tabs = row.querySelector('[data-pad-row-tabs]') as HTMLElement
    const state = row.querySelector('[data-pad-row-state]') as HTMLElement
    expect(state.className).toContain(PAD_SECOND_ROW_CLASS)
    expect(tabs.className).toContain('shrink-0')
    expect(within(tabs).getByRole('button', { name: 'Highlight' })).toBeInTheDocument()
    expect(within(state).getByText('Focus here')).toBeInTheDocument()
    expect(state.querySelector('[data-pad-summary]')).not.toBeNull()
  })

  it('keeps the merged row and the folded strip as they were: no label, no verbs, no summary', () => {
    draw({ dense: true, leading: <span>leading</span>, controls: <span>ctl</span> })
    const merged = document.querySelector('[data-pad-row="merged"]') as HTMLElement
    expect(merged.className).toContain('h-8')
    expect(merged.querySelector('[data-pad-row-tabs]')).toBeNull()
    expect(screen.queryByText('Pads', { selector: 'div' })).toBeNull()
    expect(screen.getByText('leading').compareDocumentPosition(screen.getByText('ctl')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    cleanup()
    draw({ folded: true, controls: <span>ctl</span> })
    const folded = document.querySelector('[data-busk-page-strip="folded"]') as HTMLElement
    expect(folded.className).toContain('h-10')
    expect(folded).toHaveTextContent('Ballads')
    expect(within(folded).queryByRole('button', { name: 'Ballads' })).toBeNull()
  })
})

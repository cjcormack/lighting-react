// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

/**
 * Two modes since session 2b, because the `ShowBar` grew its own amber BLIND tile: this badge is
 * the blind signal in the app header, and only a value count in the bar.
 */

const summary = { entryCount: 0, blind: false }
vi.mock('../store/programmer', () => ({
  useProgrammerSummaryQuery: () => ({ data: summary }),
}))
vi.mock('../store/projects', () => ({
  useCurrentProjectQuery: () => ({ data: { id: 1 } }),
}))

import { ProgrammerIndicator } from './ProgrammerIndicator'

function draw(props: { blindShownSeparately?: boolean; at?: string } = {}) {
  const { at = '/projects/1/show', ...rest } = props
  return render(
    <MemoryRouter initialEntries={[at]}>
      <ProgrammerIndicator {...rest} />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  summary.entryCount = 0
  summary.blind = false
})

describe('ProgrammerIndicator', () => {
  it('says nothing when the programmer is empty and not blind', () => {
    const { container } = draw()
    expect(container.innerHTML).toBe('')
  })

  it('reports blind on its own, because a blind programmer looks like a working one', () => {
    summary.blind = true
    draw()
    expect(screen.getByText('Blind')).toBeTruthy()
  })

  it('reports the value count', () => {
    summary.entryCount = 5
    draw()
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('does not repeat blind where a dedicated control sits beside it', () => {
    // The ShowBar's own BLIND tile is louder and actionable; two amber badges saying the same word
    // is worse than one.
    summary.blind = true
    summary.entryCount = 5
    draw({ blindShownSeparately: true })

    expect(screen.queryByText('Blind')).toBeNull()
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('drops out entirely when blind is its only news and something else is telling it', () => {
    summary.blind = true
    const { container } = draw({ blindShownSeparately: true })
    expect(container.innerHTML).toBe('')
  })

  it('still explains blind in the tooltip where the badge stays quiet', () => {
    // "5 values, and none of them reaching the stage" is the useful sentence, and a tooltip costs
    // no width beside the tile.
    summary.blind = true
    summary.entryCount = 5
    draw({ blindShownSeparately: true })
    expect(screen.getByLabelText(/gated out of the stage output/)).toBeTruthy()
  })

  it('offers the trip to the programmer from anywhere else', () => {
    summary.entryCount = 5
    draw({ at: '/projects/1/show' })

    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/projects/1/programmer')
    expect(link.getAttribute('aria-label')).toContain('Go to the programmer')
  })

  it('is inert on the programmer itself — a link to where you already are is noise', () => {
    summary.entryCount = 5
    draw({ at: '/projects/1/programmer' })

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByLabelText(/Programmer holds 5 values$/)).toBeTruthy()
  })

  it('counts a programmer subroute as being here', () => {
    // Segment-aware, not a bare `startsWith`: `/programmer/fx` is still the programmer, and the
    // badge must not offer a trip to the page it is already sitting on.
    summary.entryCount = 5
    draw({ at: '/projects/1/programmer/fx' })

    expect(screen.queryByRole('link')).toBeNull()
  })

  it('keeps the amber wash for its own blind reporting only', () => {
    summary.blind = true
    summary.entryCount = 5
    const own = draw()
    expect(own.container.innerHTML).toContain('amber')
    cleanup()

    const beside = draw({ blindShownSeparately: true })
    expect(beside.container.innerHTML).not.toContain('amber')
  })
})

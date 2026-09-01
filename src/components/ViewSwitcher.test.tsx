// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { LookFamilyFilterBar, ViewSwitcher } from './ViewSwitcher'

afterEach(cleanup)

/**
 * These assert on class strings, which is normally brittle — but the bug being fenced against is
 * exactly a class string. The labels used to collapse at a viewport `sm:`, and the app sidebar
 * insets the content region, so viewport width is not the width these sit in. jsdom applies no
 * CSS, so there is no other way to see it.
 *
 * What no test can catch is the other half: a *host* that forgets `@container`, which drops the
 * labels permanently and silently. Those six hosts are listed in `ViewSwitcher.tsx`.
 */
describe('ViewSwitcher labels', () => {
  it('collapse on a container query, never the viewport', () => {
    render(
      <MemoryRouter>
        <ViewSwitcher current="show" projectId={1} />
      </MemoryRouter>,
    )
    const label = screen.getByText('Show')
    expect(label.className).toContain('@[820px]:inline')
    expect(label.className).not.toMatch(/\bsm:/)
  })

  it('use a threshold that suits the number of pills', () => {
    // Five family pills need room four view pills do not — and the view threshold has to move
    // with the pill count, which is why it has been 820 (four views), 760 (three) and 820 again
    // (four, with Busk). Asserting the number is what stops the next pill being added for free.
    render(<LookFamilyFilterBar current="ALL" onChange={() => {}} />)
    expect(screen.getByText('All').className).toContain('@[720px]:inline')
  })

  it('offers all four live views, with the current one static', () => {
    render(
      <MemoryRouter>
        <ViewSwitcher current="busk" projectId={1} />
      </MemoryRouter>,
    )
    expect(screen.getByLabelText('Busk')).toHaveAttribute('aria-current', 'page')
    for (const [label, href] of [
      ['Programmer', '/projects/1/programmer'],
      ['Show', '/projects/1/show'],
      ['Prompt Book', '/projects/1/prompt-book'],
    ] as const) {
      expect(screen.getByLabelText(label)).toHaveAttribute('href', href)
    }
  })
})

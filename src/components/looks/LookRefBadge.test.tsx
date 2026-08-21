// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LookRefBadge } from './LookRefBadge'

afterEach(cleanup)

describe('LookRefBadge', () => {
  it('shows the look name, never a P-number short code', () => {
    // `P1` already means the positional colour list FX parameters index. Minting a second
    // numeric shorthand for Looks would make two unrelated grammars look identical in the one
    // place the difference matters.
    render(<LookRefBadge name="Warm Amber" resolvedValue="#ff8800" />)
    expect(screen.getByText('Warm Amber')).toBeTruthy()
    expect(screen.queryByText(/^P\d/)).toBeNull()
  })

  it('reads as broken when the look is gone', () => {
    render(<LookRefBadge missing />)
    expect(screen.getByText('Look missing')).toBeTruthy()
  })

  it('is neutral, not broken, when the name simply is not known yet', () => {
    // The cue card looks Looks up in a list that may still be loading. Claiming the row is
    // broken for the length of that fetch would report every healthy reference as dead.
    render(<LookRefBadge />)
    expect(screen.getByText('Look')).toBeTruthy()
    expect(screen.queryByText('Look missing')).toBeNull()
  })

  it('names the look in the title when it no longer covers this fixture', () => {
    // The distinction matters: a deleted Look is a show-file problem, while one that simply
    // doesn't cover this head is fixed by adding a row for it.
    const { container } = render(<LookRefBadge name="Warm Amber" missing />)
    const title = container.querySelector('span')?.getAttribute('title') ?? ''
    expect(title).toContain('Warm Amber')
    expect(title).toContain('no longer covers')
  })

  it('carries no swatch, whatever the reference resolves to', () => {
    // A Look declares no attribute type, so there is no family to colour the chip by — and a
    // colour-shaped literal on a Look that also covers position would make the chip claim a type
    // the entity does not have. The title still names the resolved value.
    const { container } = render(<LookRefBadge name="Warm Amber" resolvedValue="#ff8800" />)
    const swatch = [...container.querySelectorAll('span')].find((el) =>
      el.getAttribute('style')?.includes('background'),
    )
    expect(swatch).toBeUndefined()
    expect(container.querySelector('span')?.getAttribute('title')).toContain('#ff8800')
  })
})

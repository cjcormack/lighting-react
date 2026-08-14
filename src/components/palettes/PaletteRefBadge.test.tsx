// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PaletteRefBadge } from './PaletteRefBadge'

afterEach(cleanup)

describe('PaletteRefBadge', () => {
  it('shows the palette name, never a P-number short code', () => {
    // `P1` already means the positional colour list FX parameters index. Minting a second
    // numeric shorthand for named palettes would make two unrelated grammars look identical in
    // the one place the difference matters.
    render(<PaletteRefBadge name="Warm Amber" type="COLOUR" resolvedValue="#ff8800" />)
    expect(screen.getByText('Warm Amber')).toBeTruthy()
    expect(screen.queryByText(/^P\d/)).toBeNull()
  })

  it('reads as broken when the palette is gone', () => {
    render(<PaletteRefBadge missing />)
    expect(screen.getByText('Palette missing')).toBeTruthy()
  })

  it('is neutral, not broken, when the name simply is not known yet', () => {
    // The cue card looks palettes up in a list that may still be loading. Claiming the row is
    // broken for the length of that fetch would report every healthy reference as dead.
    render(<PaletteRefBadge />)
    expect(screen.getByText('Palette')).toBeTruthy()
    expect(screen.queryByText('Palette missing')).toBeNull()
  })

  it('names the palette in the title when it no longer covers this fixture', () => {
    // The distinction matters: a deleted palette is a show-file problem, while one that simply
    // doesn't cover this head is fixed by re-recording it with the head selected.
    const { container } = render(<PaletteRefBadge name="Warm Amber" type="COLOUR" missing />)
    const title = container.querySelector('span')?.getAttribute('title') ?? ''
    expect(title).toContain('Warm Amber')
    expect(title).toContain('no longer covers')
  })

  it('leads a resolving colour reference with its resolved swatch', () => {
    const { container } = render(
      <PaletteRefBadge name="Warm Amber" type="COLOUR" resolvedValue="#ff8800" />,
    )
    const swatch = [...container.querySelectorAll('span')].find((el) =>
      el.getAttribute('style')?.includes('background'),
    )
    expect(swatch).toBeTruthy()
  })

  it('has no swatch for a non-colour palette, which has nothing to show', () => {
    const { container } = render(
      <PaletteRefBadge name="Downstage" type="POSITION" resolvedValue="10,20" />,
    )
    const swatch = [...container.querySelectorAll('span')].find((el) =>
      el.getAttribute('style')?.includes('background'),
    )
    expect(swatch).toBeUndefined()
  })
})

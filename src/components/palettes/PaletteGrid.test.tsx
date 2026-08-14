// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PaletteGrid } from './PaletteGrid'
import type { PaletteSummary } from '@/api/palettesApi'

afterEach(cleanup)

function summary(overrides: Partial<PaletteSummary> = {}): PaletteSummary {
  return {
    id: 1,
    uuid: '11111111-2222-3333-4444-555555555555',
    name: 'Warm Amber',
    type: 'COLOUR',
    sortOrder: 0,
    entryCount: 12,
    targetCount: 6,
    preview: ['#ff8800', '#ffaa33'],
    referenceCount: 0,
    ...overrides,
  }
}

describe('PaletteGrid', () => {
  it('renders each palette with its coverage, from the summary alone', () => {
    // The summary carries `preview`/`targetCount`/`entryCount` precisely so a page of tiles is
    // one request rather than one per tile. A tile that needed the detail read would put the
    // whole bank behind N round trips.
    render(<PaletteGrid palettes={[summary()]} onOpen={() => {}} />)
    expect(screen.getByText('Warm Amber')).toBeTruthy()
    expect(screen.getByText(/6 fixtures · 12 values/)).toBeTruthy()
  })

  it('shows the reference count only when something references it', () => {
    const { rerender } = render(<PaletteGrid palettes={[summary()]} onOpen={() => {}} />)
    expect(screen.queryByText('0')).toBeNull()
    rerender(<PaletteGrid palettes={[summary({ referenceCount: 4 })]} onOpen={() => {}} />)
    expect(screen.getByText('4')).toBeTruthy()
  })

  it('opens a palette on click and on Enter', () => {
    const onOpen = vi.fn()
    render(<PaletteGrid palettes={[summary()]} onOpen={onOpen} />)
    const tile = screen.getByLabelText('Open palette Warm Amber')
    fireEvent.click(tile)
    fireEvent.keyDown(tile, { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('says how to make the first one rather than showing an empty grid', () => {
    render(<PaletteGrid palettes={[]} onOpen={() => {}} emptyHint="Record one." />)
    expect(screen.getByText(/No palettes of this type yet/)).toBeTruthy()
    expect(screen.getByText('Record one.')).toBeTruthy()
  })
})

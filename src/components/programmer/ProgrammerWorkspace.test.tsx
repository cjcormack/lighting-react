// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ProgrammerWorkspace,
  RAIL_DEFAULT_WIDTH,
  RAIL_MAX_WIDTH,
  RAIL_MIN_WIDTH,
  RailBodyFrame,
  RailStripFrame,
  useRailArm,
} from './ProgrammerWorkspace'

/**
 * The rail's three arms and the state behind them, driven through a stand-in rail that reads
 * `useRailArm` the way `ProgrammerRail` does.
 *
 * jsdom lays nothing out, so the arms cannot be pinned by *measuring*: what is pinned instead is
 * the contract the container queries are written against — which classes the frames carry in
 * each state, on the child of the `@container` wrapper — plus everything that is JavaScript: the
 * two flags, what writes each, the drag's arithmetic and its two endings, and that the stored
 * width survives a remount. The widths themselves are measured in a browser (space plan §6).
 */
let railRenders = 0

function TestRail() {
  const arm = useRailArm()
  railRenders += 1
  return (
    <>
      {(!arm.collapsed || arm.overlayOpen) && (
        <RailBodyFrame>
          <button onClick={arm.collapse}>collapse</button>
          <button onClick={arm.closeOverlay}>close</button>
        </RailBodyFrame>
      )}
      <RailStripFrame>
        <button onClick={arm.expand}>expand</button>
        <button onClick={arm.openOverlay}>open</button>
      </RailStripFrame>
    </>
  )
}

function draw() {
  return render(
    <ProgrammerWorkspace grid={<div data-testid="grid">grid</div>} rail={<TestRail />} />,
  )
}

const body = () => screen.getByRole('complementary', { name: 'Layers and effects' })
const strip = () => screen.getByText('expand').parentElement as HTMLElement
const handle = () => screen.getByRole('separator', { name: 'Resize the rail' })
/** The row carries `select-none` only while a drag runs — the drag's one visible trace. */
const resizing = () => body().parentElement!.className.includes('select-none')

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  railRenders = 0
})

describe('ProgrammerWorkspace', () => {
  it('declares the container on a wrapper and queries it from the children', () => {
    // The trap the doc comment records: a container query never matches the element that
    // declares the container. Every arm class has to sit at least one level down.
    const { container } = draw()
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.className).toContain('@container')
    expect(body().className).not.toContain('@container')
    expect(body().parentElement).toBe(wrapper.firstElementChild)
  })

  it('docks at the default width, with the strip hidden in the wide arm', () => {
    draw()
    expect(body().style.getPropertyValue('--rail-w')).toBe(`${RAIL_DEFAULT_WIDTH}px`)
    expect(body().className).toContain('@min-[1200px]:w-[var(--rail-w)]')
    expect(body().className).not.toContain('@min-[1200px]:hidden')
    // Narrow, the same element is the overlay — shut until opened.
    expect(body().className).toContain('@max-[1200px]:absolute')
    expect(body().className).toContain('@max-[1200px]:hidden')
    expect(strip().className).toContain('@min-[1200px]:hidden')
  })

  it('collapses to the strip in the wide arm, and remembers it', () => {
    draw()
    fireEvent.click(screen.getByText('collapse'))
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(strip().className).not.toContain('@min-[1200px]:hidden')
    expect(JSON.parse(window.localStorage.getItem('programmer.rail.collapsed') ?? 'null')).toBe(
      true,
    )

    cleanup()
    draw()
    expect(screen.queryByRole('complementary')).toBeNull()
    fireEvent.click(screen.getByText('expand'))
    expect(body().className).not.toContain('@min-[1200px]:hidden')
  })

  it('opens as an overlay in the narrow arm without touching the docked preference', () => {
    draw()
    fireEvent.click(screen.getByText('collapse'))
    fireEvent.click(screen.getByText('open'))
    // Mounted, and unhidden for the narrow arm only: the wide arm still reads `collapsed`.
    expect(body().className).not.toContain('@max-[1200px]:hidden')
    expect(body().className).toContain('@min-[1200px]:hidden')
    expect(body().className).toContain('@max-[1200px]:right-10')
    expect(body().className).toContain('@max-[1200px]:w-[300px]')

    fireEvent.click(screen.getByText('close'))
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(JSON.parse(window.localStorage.getItem('programmer.rail.collapsed') ?? 'null')).toBe(
      true,
    )
  })

  it('closes the overlay on Escape, unless something above it took the key', () => {
    draw()
    fireEvent.click(screen.getByText('open'))
    expect(body().className).not.toContain('@max-[1200px]:hidden')

    // A sheet or popover open over the rail prevents the default on the Escape it handles; one
    // press must close that and not the rail as well.
    const taken = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    taken.preventDefault()
    window.dispatchEvent(taken)
    expect(body().className).not.toContain('@max-[1200px]:hidden')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(body().className).toContain('@max-[1200px]:hidden')
  })

  it('closes the overlay on a press anywhere on the grid', () => {
    draw()
    fireEvent.click(screen.getByText('open'))
    fireEvent.pointerDown(screen.getByTestId('grid'))
    expect(body().className).toContain('@max-[1200px]:hidden')
  })

  it('sets the docked width from the handle, leftwards to grow, clamped to the bounds', () => {
    draw()
    const rendersBefore = railRenders
    fireEvent.pointerDown(handle(), { button: 0, clientX: 1000 })
    expect(resizing()).toBe(true)

    fireEvent.pointerMove(window, { clientX: 900 })
    expect(body().style.getPropertyValue('--rail-w')).toBe('400px')
    // The width rides its own context, read by the frame alone: nothing that reads the arm —
    // which is the rail, above every layer and FX row — re-renders per pointer move.
    expect(railRenders).toBe(rendersBefore)

    fireEvent.pointerMove(window, { clientX: 100 })
    expect(body().style.getPropertyValue('--rail-w')).toBe(`${RAIL_MAX_WIDTH}px`)
    fireEvent.pointerMove(window, { clientX: 1900 })
    expect(body().style.getPropertyValue('--rail-w')).toBe(`${RAIL_MIN_WIDTH}px`)

    // Nothing is stored until the release, and the release stores the last value shown.
    expect(window.localStorage.getItem('programmer.rail.width')).toBe(String(RAIL_DEFAULT_WIDTH))
    fireEvent.pointerMove(window, { clientX: 950 })
    fireEvent.pointerUp(window)
    expect(resizing()).toBe(false)
    expect(railRenders).toBe(rendersBefore)
    expect(window.localStorage.getItem('programmer.rail.width')).toBe('350')
  })

  it('ends a drag on pointercancel exactly as on pointerup', () => {
    // A touchscreen pan reclaimed by the browser sends no pointerup. Left `resizing`, the frame
    // would keep its window listeners and write a width on the next movement with nothing held.
    draw()
    fireEvent.pointerDown(handle(), { button: 0, clientX: 1000 })
    fireEvent.pointerMove(window, { clientX: 940 })
    fireEvent.pointerCancel(window)
    expect(resizing()).toBe(false)
    expect(window.localStorage.getItem('programmer.rail.width')).toBe('360')

    fireEvent.pointerMove(window, { clientX: 500 })
    expect(body().style.getPropertyValue('--rail-w')).toBe('360px')
  })

  it('keeps the stored width across a remount, and clamps one it does not trust', () => {
    window.localStorage.setItem('programmer.rail.width', '440')
    draw()
    expect(body().style.getPropertyValue('--rail-w')).toBe('440px')
    cleanup()

    window.localStorage.setItem('programmer.rail.width', '9000')
    draw()
    expect(body().style.getPropertyValue('--rail-w')).toBe(`${RAIL_MAX_WIDTH}px`)
    cleanup()

    window.localStorage.setItem('programmer.rail.width', '"wide"')
    draw()
    expect(body().style.getPropertyValue('--rail-w')).toBe(`${RAIL_DEFAULT_WIDTH}px`)
  })

  it('renders the grid exactly once, and never inside the rail', () => {
    draw()
    expect(screen.getAllByTestId('grid')).toHaveLength(1)
    expect(body().contains(screen.getByTestId('grid'))).toBe(false)
  })
})

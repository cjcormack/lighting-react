// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Store-connected children (speed masters, the programmer indicator) are mocked to nothing: this
// suite is about the BAR's own structure, and mounting them would drag in the real WebSocket.
vi.mock('./SpeedMasters', () => ({
  SpeedMasters: () => <div data-testid="speed-masters" />,
  SpeedMastersChip: () => <div />,
}))
vi.mock('./ProgrammerIndicator', () => ({ ProgrammerIndicator: () => null }))

import { ShowBar } from './ShowBar'

afterEach(cleanup)

const PROPS = {
  stackName: 'Act 1',
  dbo: false,
  onDbo: () => {},
  activeNumber: 'Q4',
  activeName: 'Warm Wash',
  standbyNumber: 'Q5',
  standbyName: 'Sunset Fade',
  fadeRemainMs: null,
  onGo: () => {},
  onBack: () => {},
}

/**
 * jsdom applies no CSS, so container queries are invisible here and none of the *rungs* can be
 * tested. What can be tested is the thing the rungs were introduced to guarantee: that nothing is
 * removed from the DOM at any width. The bar used to gate its whole live-state block behind
 * `@[560px]`, and that class is exactly what these assertions fence against coming back.
 */
describe('ShowBar', () => {
  it('never hides the live-state block', () => {
    const { container } = render(<ShowBar {...PROPS} />)
    const live = container.querySelector('.flex-1')
    expect(live).toBeTruthy()
    // The regression fence for the 560px collision. Cue numbers must survive every width; only
    // NAMES are allowed a `hidden …:block` gate.
    expect(live!.className).not.toMatch(/(^|\s)hidden(\s|$)/)
    expect(screen.getByText('Q4')).toBeTruthy()
    expect(screen.getByText('Q5')).toBeTruthy()
  })

  it('keeps the transport on the surface, with GO widening as the bar narrows', () => {
    render(<ShowBar {...PROPS} />)
    const go = screen.getByRole('button', { name: 'GO' })
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
    // `flex-1` below 700px and `flex-none` above it — GO gets bigger as room runs out, which is
    // the right way round for a control pressed in the dark.
    expect(go.className).toMatch(/(^|\s)flex-1(\s|$)/)
    expect(go.className).toContain('@[700px]:flex-none')
  })

  it('renders the speed masters rather than a BPM tile of its own', () => {
    // Master 1 used to be a read-only tile here AND absent from the strip beside it. That split is
    // what made the 560-900px band unwinnable; one owner is the fix.
    render(<ShowBar {...PROPS} />)
    expect(screen.getByTestId('speed-masters')).toBeTruthy()
    expect(screen.queryByText('TAP')).toBeNull()
    expect(screen.queryByText(/M1 · BPM/)).toBeNull()
  })

  it('toggles blackout', () => {
    const onDbo = vi.fn()
    render(<ShowBar {...PROPS} onDbo={onDbo} />)
    const dbo = screen.getByTitle('Toggle blackout')
    expect(dbo.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(dbo)
    expect(onDbo).toHaveBeenCalled()
  })
})

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('./SaveStatusIndicator', () => ({ SaveStatusIndicator: () => null }))

import { ShowHeader } from './ShowHeader'

/**
 * The amber wash is the lock's loudest signal, and it moved here from the Prompt Book's own toolbar
 * in session 2b so both lock-bearing views give it in the same place.
 */
function draw(over: Partial<React.ComponentProps<typeof ShowHeader>> = {}) {
  return render(
    <MemoryRouter>
      <ShowHeader
        view="show"
        projectId={1}
        projectName="Hamlet"
        isShowActive
        canStart={false}
        onStart={vi.fn()}
        onStop={vi.fn()}
        {...over}
      />
    </MemoryRouter>,
  )
}

const root = (c: HTMLElement) => c.firstElementChild!.className

afterEach(cleanup)

describe('ShowHeader', () => {
  it('washes amber when a running show is unlocked', () => {
    const { container } = draw({ unlockedWarning: true })
    expect(root(container)).toContain('bg-amber-400/15')
    expect(root(container)).toContain('border-amber-500/50')
  })

  it('stays quiet otherwise', () => {
    const { container } = draw({ unlockedWarning: false })
    expect(root(container)).not.toContain('amber')
  })

  it('reserves the border in both states so the layout cannot shift', () => {
    // Colouring a border that isn't there would move the whole page down a pixel as the lock flips.
    const quiet = draw()
    expect(root(quiet.container)).toContain('border-b')
    expect(root(quiet.container)).toContain('border-transparent')
    quiet.unmount()

    const warned = draw({ unlockedWarning: true })
    expect(root(warned.container)).toContain('border-b')
  })

  // No test for "the breadcrumb names only the view": there is no `extra` prop to pass any more, so
  // that is a compile-time guarantee. A DOM assertion would only be brittle — "Show" appears in the
  // switcher pill as well as the trail.

  it('renders the actions slot, where the lock control lives', () => {
    draw({ actions: <button>lock</button> })
    expect(screen.getByText('lock')).toBeTruthy()
  })
})

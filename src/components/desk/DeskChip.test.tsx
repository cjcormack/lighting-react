// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { resetDeskFollowStores, unlinkFromDesk, isFollowingDesk } from '@/lib/deskFollow'

vi.mock('@/lib/windowIdentity', () => ({
  useWindowName: () => 'Screen 1',
  windowId: () => 'w-1',
}))

import { DeskChip } from './DeskChip'

/**
 * The desk chip is drawn only while this window is unlinked (busk-chrome plan D18): following is
 * the resting state and says nothing. Unlinked it is the dashed *This window*, its press relinks,
 * and its accessible name is whole whatever the host's subject class hides (D19).
 */
afterEach(() => {
  window.sessionStorage.clear()
  resetDeskFollowStores()
})

describe('DeskChip', () => {
  it('renders nothing while following the desk', () => {
    const { container } = render(<DeskChip showSubject />)
    expect(container).toBeEmptyDOMElement()
  })

  it('draws the dashed This window once unlinked, and its press follows the desk again', () => {
    unlinkFromDesk({ targets: [], families: null })
    render(<DeskChip />)
    const chip = screen.getByRole('button', { name: 'This window' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(chip.className).toContain('border-dashed')
    fireEvent.click(chip)
    expect(isFollowingDesk()).toBe(true)
    expect(screen.queryByRole('button', { name: /This window/ })).toBeNull()
  })

  it('names its subject on the busk band and keeps the whole name under the host’s fold class', () => {
    unlinkFromDesk({ targets: [], families: null })
    render(<DeskChip showSubject subjectClass="hidden @[700px]:inline" />)
    const chip = screen.getByRole('button', { name: 'Targets: This window' })
    const subject = chip.querySelector('[data-pill-subject]') as HTMLElement
    expect(subject.className).toContain('hidden @[700px]:inline')
    // The name is the `aria-label`, not the visible text, so hiding the subject changes nothing.
    expect(chip).toHaveAttribute('aria-label', 'Targets: This window')
  })
})

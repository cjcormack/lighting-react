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
 * The desk chip always says which selection the window is on (desk-follow plan D8, revisiting
 * busk-chrome D18): following, the link badge — a glyph, a mark and not a control, hover
 * *Following the desk selection*; unlinked, the dashed *This window*, whose press relinks and whose
 * accessible name is whole whatever the host's subject class hides (D19).
 */
afterEach(() => {
  window.sessionStorage.clear()
  resetDeskFollowStores()
})

describe('DeskChip', () => {
  it('draws the link badge while following the desk — a glyph, no button, and it never takes the pill’s shrink', () => {
    render(<DeskChip showSubject className="min-w-0 shrink" />)
    const badge = screen.getByRole('img', { name: 'Following the desk selection' })
    expect(badge).toHaveAttribute('title', 'Following the desk selection')
    expect(badge).toHaveTextContent('')
    expect(badge.className).toContain('shrink-0')
    expect(badge.className).not.toContain('min-w-0')
    expect(screen.queryByRole('button')).toBeNull()
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
    expect(screen.getByRole('img', { name: 'Following the desk selection' })).toBeInTheDocument()
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

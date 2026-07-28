// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PromptBookToolbar } from './PromptBookToolbar'

const base = {
  scriptFileName: 'script.pdf',
  canEdit: true,
  onToggleLock: () => {},
  canUndo: false,
  onUndo: () => {},
  coverPages: 0,
  pageCount: 10,
  onCoverPagesChange: () => {},
  activeLabel: null,
  onJumpToLive: () => {},
  warningCount: 0,
  onToggleWarnings: () => {},
  relockCountdown: null,
  onStayUnlocked: () => {},
}

/** The bar's own amber wash — the "you unlocked a running show" signal. */
const isWashedAmber = (container: HTMLElement) =>
  container.firstElementChild!.className.includes('bg-amber-400/15')

describe('PromptBookToolbar', () => {
  it('shows the lock control while the show is running', () => {
    render(<PromptBookToolbar {...base} showActive locked />)
    expect(screen.getByRole('button', { name: 'Unlock for editing' })).toBeTruthy()
  })

  it('warns in amber when a running show is unlocked', () => {
    const { container } = render(<PromptBookToolbar {...base} showActive locked={false} />)
    expect(isWashedAmber(container)).toBe(true)
    expect(screen.getByRole('button', { name: 'Lock the prompt book' })).toBeTruthy()
  })

  it('drops the lock control and the amber chrome when the show is stopped', () => {
    // Stopped, the book is unconditionally editable: there is no lock to toggle and
    // nothing to warn about, so the bar is plain document chrome.
    const { container } = render(<PromptBookToolbar {...base} showActive={false} locked={false} />)
    expect(isWashedAmber(container)).toBe(false)
    expect(screen.queryByRole('button', { name: 'Unlock for editing' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lock the prompt book' })).toBeNull()
  })

  it('keeps the disabled lock control for a book that cannot be edited', () => {
    render(<PromptBookToolbar {...base} canEdit={false} showActive={false} locked />)
    const button = screen.getByRole('button', { name: 'Unlock for editing' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })
})

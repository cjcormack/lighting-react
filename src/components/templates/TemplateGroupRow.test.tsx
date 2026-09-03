// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TemplateGroupRow } from './TemplateGroupRow'
import type { TemplateGroup } from '@/api/templatesApi'

afterEach(cleanup)

const keys: TemplateGroup = { id: 10, uuid: 'g10', name: 'Keys', sortOrder: 1, family: 'COLOUR' }

/**
 * Radix's dropdown opens on `pointerdown` (button 0) and on ArrowDown, not on `click`. Both are
 * sent: the pointer path is what a mouse does, and ArrowDown is idempotent on an open menu where
 * Enter would toggle it shut again.
 */
function openMenu(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
}

/**
 * The group header's two gestures, without a `DndContext`: rename is inline and commits on Enter,
 * and *Ungroup* is the delete. The DnD refs are optional precisely so this renders bare.
 */
describe('TemplateGroupRow', () => {
  it('names the group, its family and its size', () => {
    render(
      <TemplateGroupRow group={keys} family="COLOUR" memberCount={2} editable>
        <div>member</div>
      </TemplateGroupRow>,
    )
    expect(screen.getByText('Keys')).toBeInTheDocument()
    expect(screen.getByText('Colour')).toBeInTheDocument()
    expect(screen.getByText('2 templates')).toBeInTheDocument()
    expect(screen.getByText('member')).toBeInTheDocument()
  })

  it('says an empty group is empty, and where to put something', () => {
    render(<TemplateGroupRow group={keys} family={null} memberCount={0} editable />)
    expect(screen.getByText('empty')).toBeInTheDocument()
    expect(screen.getByText(/Drop templates here/)).toBeInTheDocument()
    expect(screen.queryByText('Colour')).toBeNull()
  })

  it('renames inline and commits on Enter, but not an unchanged or blank name', () => {
    const onRename = vi.fn()
    render(<TemplateGroupRow group={keys} family="COLOUR" memberCount={1} editable onRename={onRename} />)

    openMenu(screen.getByRole('button', { name: 'Keys menu' }))
    fireEvent.click(screen.getByText('Rename'))
    const input = screen.getByRole('textbox', { name: 'Group name' })
    fireEvent.change(input, { target: { value: 'Warm Keys' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('Warm Keys')

    // Escape cancels rather than commits.
    openMenu(screen.getByRole('button', { name: 'Keys menu' }))
    fireEvent.click(screen.getByText('Rename'))
    const again = screen.getByRole('textbox', { name: 'Group name' })
    fireEvent.change(again, { target: { value: 'Discarded' } })
    fireEvent.keyDown(again, { key: 'Escape' })
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  /**
   * The rename starts from a dropdown item, so nothing focuses the input on its own: `select()`
   * without `focus()` left a field the operator had to click before typing reached it, and one
   * whose `onBlur` commit could never fire.
   */
  it('focuses the rename field so typing lands in it', () => {
    render(<TemplateGroupRow group={keys} family="COLOUR" memberCount={1} editable onRename={vi.fn()} />)
    openMenu(screen.getByRole('button', { name: 'Keys menu' }))
    fireEvent.click(screen.getByText('Rename'))
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Group name' }))
  })

  it('offers Ungroup, not Delete — the members survive', () => {
    const onDelete = vi.fn()
    render(<TemplateGroupRow group={keys} family="COLOUR" memberCount={1} editable onDelete={onDelete} />)
    openMenu(screen.getByRole('button', { name: 'Keys menu' }))
    expect(screen.queryByText('Delete')).toBeNull()
    fireEvent.click(screen.getByText('Ungroup'))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('hides the menu when not editable', () => {
    render(<TemplateGroupRow group={keys} family="COLOUR" memberCount={1} editable={false} />)
    expect(screen.queryByRole('button', { name: 'Keys menu' })).toBeNull()
  })
})

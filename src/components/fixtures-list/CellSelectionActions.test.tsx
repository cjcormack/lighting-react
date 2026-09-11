// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./FanPopover', () => ({ FanPopover: () => <button type="button">Fan</button> }))

import { CellSelectionActions } from './CellSelectionActions'
import { cellActionCopy } from './cellEntry'

afterEach(cleanup)

/**
 * The bar's cell verbs are the marquee's two keys with a button on them. What is pinned is that
 * they take the container's gate and words rather than deciding anything themselves.
 */
describe('CellSelectionActions', () => {
  it('runs Set and Clear from the container, and carries its words', () => {
    const onSet = vi.fn()
    const onClear = vi.fn()
    render(
      <CellSelectionActions
        copy={cellActionCopy({ kind: 'local' }, false, 2)}
        canSet
        onSet={onSet}
        canClear
        onClear={onClear}
        fanColumns={[]}
      />,
    )
    const set = screen.getByRole('button', { name: 'Set' })
    expect(set).toHaveAttribute('title', expect.stringContaining('in Local'))
    fireEvent.click(set)
    expect(onSet).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Clear cells' }))
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Fan' })).toBeInTheDocument()
  })

  it('is disabled where the gate refuses, with the reason on the button', () => {
    render(
      <CellSelectionActions
        copy={cellActionCopy({ kind: 'output' }, false, 2)}
        canSet={false}
        onSet={() => {}}
        canClear={false}
        onClear={() => {}}
        fanColumns={[]}
      />,
    )
    const set = screen.getByRole('button', { name: 'Set' })
    expect(set).toBeDisabled()
    expect(set).toHaveAttribute('title', expect.stringContaining('read of the cook'))
    expect(screen.getByRole('button', { name: 'Clear cells' })).toBeDisabled()
  })
})

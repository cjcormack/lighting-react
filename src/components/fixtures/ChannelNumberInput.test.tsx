// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ChannelNumberInput } from './ChannelNumberInput'

/**
 * The typable channel byte the colour editor grew for `PD-COLOUR-EDITOR-INPUTS`.
 *
 * Two of these are the reason the field keeps its own text at all: an emptied field must not
 * commit (`Number('')` is 0, which on a colour channel is a blackout the operator never asked
 * for), and it must snap back to the desk's value when it is left.
 */
describe('ChannelNumberInput', () => {
  it('commits a typed byte', () => {
    const onChange = vi.fn()
    render(<ChannelNumberInput label="R" value={0} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('R'), { target: { value: '200' } })
    expect(onChange).toHaveBeenCalledWith(200)
  })

  it('clamps to the 0–255 channel range and rounds', () => {
    const onChange = vi.fn()
    render(<ChannelNumberInput label="R" value={0} onChange={onChange} />)
    const field = screen.getByLabelText('R')
    fireEvent.change(field, { target: { value: '900' } })
    fireEvent.change(field, { target: { value: '-4' } })
    fireEvent.change(field, { target: { value: '12.6' } })
    expect(onChange.mock.calls).toEqual([[255], [0], [13]])
  })

  it('commits nothing while the field is empty mid-retype', () => {
    const onChange = vi.fn()
    render(<ChannelNumberInput label="R" value={200} onChange={onChange} />)
    const field = screen.getByLabelText('R')
    fireEvent.change(field, { target: { value: '' } })
    expect(onChange).not.toHaveBeenCalled()
    // The empty text is the operator's, so it stays on screen until they leave.
    expect((field as HTMLInputElement).value).toBe('')
  })

  it('drops the typed text on blur, so the field shows what the desk holds', () => {
    render(<ChannelNumberInput label="R" value={200} onChange={vi.fn()} />)
    const field = screen.getByLabelText('R') as HTMLInputElement
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.blur(field)
    expect(field.value).toBe('200')
  })

  it('names the field for a screen reader even where the row draws the label', () => {
    render(<ChannelNumberInput label="W value" hideLabel value={0} onChange={vi.fn()} />)
    expect(screen.getByLabelText('W value')).toBeTruthy()
    expect(screen.queryByText('W value')).toBeNull()
  })
})

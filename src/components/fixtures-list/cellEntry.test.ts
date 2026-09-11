// @vitest-environment jsdom — `marqueeOwnsKeyTarget` reads the DOM; the grammar half needs none.
import { describe, expect, it } from 'vitest'
import {
  cellEntryHint,
  cellKeyboardPermission,
  marqueeOwnsKeyTarget,
  parseCellEntry,
} from './cellEntry'

/**
 * The typed-value grammar. Each arm is pinned on its own because the field is one input for four
 * value shapes and the order the parser tries them in is what disambiguates `10,20` (position)
 * from `10,20,30` (colour) from `102030` (a level `planBatchWrites` will clamp).
 */
describe('parseCellEntry', () => {
  it('reads a raw level, the same 0–255 the popover field takes', () => {
    expect(parseCellEntry('127')).toEqual({ kind: 'slider', value: 127 })
    expect(parseCellEntry(' 0 ')).toEqual({ kind: 'slider', value: 0 })
  })

  it('reads a percentage of 255, matching the cell readout', () => {
    expect(parseCellEntry('50%')).toEqual({ kind: 'slider', value: 128 })
    expect(parseCellEntry('100 %')).toEqual({ kind: 'slider', value: 255 })
    expect(parseCellEntry('150%')).toEqual({ kind: 'slider', value: 255 })
  })

  it('reads full and out', () => {
    expect(parseCellEntry('full')).toEqual({ kind: 'slider', value: 255 })
    expect(parseCellEntry('OUT')).toEqual({ kind: 'slider', value: 0 })
  })

  it('reads a hex colour with or without the hash, long or short', () => {
    expect(parseCellEntry('#ff8800')).toEqual({ kind: 'colour', r: 255, g: 136, b: 0 })
    expect(parseCellEntry('ff8800')).toEqual({ kind: 'colour', r: 255, g: 136, b: 0 })
    expect(parseCellEntry('#f80')).toEqual({ kind: 'colour', r: 255, g: 136, b: 0 })
    // Bare three-digit hex is not a colour — `127` has to stay a level — and bare six digits with
    // no letter is a mistyped level, not `#112233`.
    expect(parseCellEntry('f80')).toBeNull()
    expect(parseCellEntry('112233')).toEqual({ kind: 'slider', value: 112233 })
  })

  it('reads three components as a colour and two as a position', () => {
    expect(parseCellEntry('255, 0, 64')).toEqual({ kind: 'colour', r: 255, g: 0, b: 64 })
    expect(parseCellEntry('64,128')).toEqual({ kind: 'position', pan: 64, tilt: 128 })
  })

  it('leaves a blank axis alone rather than zeroing it', () => {
    expect(parseCellEntry(',128')).toEqual({ kind: 'position', pan: undefined, tilt: 128 })
    expect(parseCellEntry('64,')).toEqual({ kind: 'position', pan: 64, tilt: undefined })
  })

  it('refuses what it cannot read, so a blank Enter never blacks out the selection', () => {
    // `Number('')` is 0 — the popover field guards this and so must the typed one.
    expect(parseCellEntry('')).toBeNull()
    expect(parseCellEntry('   ')).toBeNull()
    expect(parseCellEntry(',')).toBeNull()
    expect(parseCellEntry('xyz')).toBeNull()
    expect(parseCellEntry('12,x')).toBeNull()
    expect(parseCellEntry('1,2,3,4')).toBeNull()
    expect(parseCellEntry('-5')).toBeNull()
  })
})

describe('cellEntryHint', () => {
  it('names only the grammars the selected columns will take', () => {
    expect(cellEntryHint(['dimmer'])).toBe('127 · 50% · full')
    expect(cellEntryHint(['colour'])).toBe('#ff8800 · r,g,b')
    expect(cellEntryHint(['position'])).toBe('pan,tilt')
    expect(cellEntryHint(['dimmer', 'colour'])).toBe('127 · 50% · full   #ff8800 · r,g,b')
  })

  it('says a wheel column may need the picker, since gobo is a slider on one head and a wheel on the next', () => {
    expect(cellEntryHint(['gobo'])).toBe('127 (a wheel takes the picker)')
  })
})

/**
 * The fourth place "read-only" is said. The marquee arms in every scope, and `useCellWriters`
 * would take a typed commit from Output or a template layer as a live write into Local, so the
 * keys have to be refused there — and refused *together* with the field, so no hint can promise a
 * key the scope withholds.
 */
describe('cellKeyboardPermission', () => {
  it('offers both keys in Local and on the plain lists', () => {
    expect(cellKeyboardPermission(null, false)).toEqual({ entry: true, clear: true })
    expect(cellKeyboardPermission({ kind: 'local' }, false)).toEqual({ entry: true, clear: true })
  })

  it('refuses both in Output — a read of the cook', () => {
    expect(cellKeyboardPermission({ kind: 'output' }, false)).toEqual({ entry: false, clear: false })
  })

  it('takes a typed value into a focused Look layer but has no clear there', () => {
    // A value lands in the row draft the way a cell edit does; the draft has no removal.
    expect(cellKeyboardPermission({ kind: 'layer', layerId: 4 }, false)).toEqual({
      entry: true,
      clear: false,
    })
  })

  it('refuses both on a focused template layer — a read, never an edit', () => {
    expect(cellKeyboardPermission({ kind: 'layer', layerId: 4 }, true)).toEqual({
      entry: false,
      clear: false,
    })
  })
})

/**
 * The DOM half of the marquee-keyboard guard (`PD-ENTER-FOCUS`).
 *
 * Pinned here rather than through the container because the whole defect was one `closest`: a cell
 * trigger is a `<button>`, so the guard that keeps chips and menu items from stealing Enter also
 * kept the marquee's *own* cells from taking it — and that is precisely where the focus sits after
 * a drag.
 */
describe('marqueeOwnsKeyTarget', () => {
  function grid(): HTMLElement {
    const root = document.createElement('div')
    root.innerHTML = `
      <div data-row-id="fixture:a">
        <div data-cell="dimmer"><button id="a-dimmer">x</button></div>
        <div data-cell="colour"><button id="a-colour">x</button></div>
      </div>
      <div data-row-id="fixture:b">
        <div data-cell="dimmer"><button id="b-dimmer">x</button></div>
        <input id="b-check" type="checkbox" />
      </div>
      <button id="toolbar-chip">chip</button>
    `
    return root
  }
  const selected = (rowId: string, col: string) => rowId === 'fixture:a' && col === 'dimmer'

  it('claims a cell trigger the marquee covers, however deep the press landed', () => {
    const root = grid()
    const button = root.querySelector('#a-dimmer')!
    expect(marqueeOwnsKeyTarget(button, selected)).toBe(true)
    // The label span inside the trigger, which is what a real click's target usually is.
    const inner = document.createElement('span')
    button.appendChild(inner)
    expect(marqueeOwnsKeyTarget(inner, selected)).toBe(true)
  })

  it('does not claim a cell outside the selection — Tab-then-Enter still opens its own editor', () => {
    const root = grid()
    expect(marqueeOwnsKeyTarget(root.querySelector('#a-colour'), selected)).toBe(false)
    expect(marqueeOwnsKeyTarget(root.querySelector('#b-dimmer'), selected)).toBe(false)
  })

  it('does not claim a control that is in no cell at all', () => {
    const root = grid()
    expect(marqueeOwnsKeyTarget(root.querySelector('#toolbar-chip'), selected)).toBe(false)
    expect(marqueeOwnsKeyTarget(root.querySelector('#b-check'), selected)).toBe(false)
    expect(marqueeOwnsKeyTarget(null, selected)).toBe(false)
  })

  it('does not claim a cell with no row above it — neither attribute is enough alone', () => {
    const orphan = document.createElement('div')
    orphan.innerHTML = '<div data-cell="dimmer"><button id="o">x</button></div>'
    expect(marqueeOwnsKeyTarget(orphan.querySelector('#o'), () => true)).toBe(false)
  })
})

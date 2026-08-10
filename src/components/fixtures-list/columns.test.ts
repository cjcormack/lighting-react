import { describe, expect, it, vi } from 'vitest'

// columns.ts reuses the descriptor finders from store/fixtures, which opens a
// WebSocket at import time — replace it before anything imports it.
vi.mock('@/api/lightingApi', async () => (await import('@/test/backendMock')).lightingApiMock())

import { resolveCell, resolutionChannels } from './columns'
import { chan, colourProp, positionProp, settingProp, sliderProp } from '@/test/fixtureFactories'

describe('resolveCell', () => {
  it('resolves the dimmer slider, and null when absent', () => {
    const dimmer = sliderProp('dimmer', 'dimmer', chan(1))
    expect(resolveCell([dimmer], 'dimmer')).toEqual({ kind: 'slider', property: dimmer })
    expect(resolveCell([sliderProp('zoom', 'zoom', chan(2))], 'dimmer')).toBeNull()
  })

  it('prefers a colour property over a colour wheel', () => {
    const rgb = colourProp('rgbColour', chan(1), chan(2), chan(3))
    const wheel = settingProp('colourWheel', 'colour', chan(4))
    expect(resolveCell([wheel, rgb], 'colour')).toEqual({ kind: 'colour', property: rgb })
    expect(resolveCell([wheel], 'colour')).toEqual({ kind: 'colour-setting', property: wheel })
    expect(resolveCell([], 'colour')).toBeNull()
  })

  it('prefers a position descriptor, falling back to paired pan/tilt sliders', () => {
    const pos = positionProp('position', chan(1), chan(2), { panMax: 540 })
    const pan = sliderProp('pan', 'pan', chan(3), { axis: 'PAN', max: 540 })
    const tilt = sliderProp('tilt', 'tilt', chan(4), { axis: 'TILT' })

    expect(resolveCell([pan, tilt, pos], 'position')).toMatchObject({
      kind: 'position',
      pan: chan(1),
      tilt: chan(2),
      panMax: 540,
    })
    expect(resolveCell([pan, tilt], 'position')).toMatchObject({
      kind: 'position',
      pan: chan(3),
      tilt: chan(4),
      panMax: 540,
      tiltMax: 255,
    })
  })

  it('requires both pan and tilt sliders', () => {
    const pan = sliderProp('pan', 'pan', chan(3), { axis: 'PAN' })
    expect(resolveCell([pan], 'position')).toBeNull()
  })

  it('picks the first gobo wheel, keeping its descriptor shape', () => {
    const wheel1 = settingProp('gobo1', 'gobo', chan(1))
    const wheel2 = settingProp('gobo2', 'gobo', chan(2))
    expect(resolveCell([wheel1, wheel2], 'gobo')).toEqual({ kind: 'setting', property: wheel1 })

    const sliderWheel = sliderProp('gobo', 'gobo', chan(3))
    expect(resolveCell([sliderWheel], 'gobo')).toEqual({ kind: 'slider', property: sliderWheel })
  })

  it('resolves wheel-like strobe/speed as slider or setting by descriptor type', () => {
    const strobeSetting = settingProp('strobe', 'strobe', chan(1))
    expect(resolveCell([strobeSetting], 'strobe')).toEqual({
      kind: 'setting',
      property: strobeSetting,
    })
    const speedSlider = sliderProp('speed', 'speed', chan(2))
    expect(resolveCell([speedSlider], 'speed')).toEqual({ kind: 'slider', property: speedSlider })
  })
})

describe('resolutionChannels', () => {
  it('collects every channel a resolution touches', () => {
    const rgbw = colourProp('rgbColour', chan(1), chan(2), chan(3), { whiteChannel: chan(4) })
    expect(resolutionChannels(resolveCell([rgbw], 'colour'))).toEqual([
      chan(1),
      chan(2),
      chan(3),
      chan(4),
    ])

    const pos = positionProp('position', chan(5), chan(6))
    expect(resolutionChannels(resolveCell([pos], 'position'))).toEqual([chan(5), chan(6)])

    expect(resolutionChannels(null)).toEqual([])
  })
})

import { useMemo } from 'react'
import { lightingApi } from '../../api/lightingApi'
import { useEditorContext } from '../../components/lighting-editor/EditorContext'
import { rgbToHex } from '../../components/fx/colourUtils'
import type { ChannelRef, ColourPropertyDescriptor } from '../../store/fixtures'

export interface CellWriters {
  writeSlider(ref: ChannelRef, value: number): void
  writeColour(
    fixtureKey: string,
    property: ColourPropertyDescriptor,
    r: number,
    g: number,
    b: number,
    w?: number,
    a?: number,
    uv?: number,
  ): void
  /** Omitted axes are left untouched (live) or filled from the fixture's
   *  current value (cue mode needs both for setProperty('position')). */
  writePosition(
    fixtureKey: string,
    pan: ChannelRef,
    tilt: ChannelRef,
    panValue: number | undefined,
    tiltValue: number | undefined,
  ): void
  writeSetting(ref: ChannelRef, level: number): void
}

/**
 * EditorContext-aware imperative writers. Unlike useUpdateChannel /
 * useUpdateFixtureColour (which close over one descriptor), these take the
 * target as an argument so a single hook instance serves every cell in the
 * table — batch apply is a loop over these calls.
 *
 * Routing mirrors usePropertyValues.ts: live → direct channel writes (Layer 4);
 * cue → cueEdit.setChannel, except RGB (one setProperty('rgbColour') per
 * fixture — the backend rejects per-channel writes on RGB sub-channels) and
 * position (setProperty('position'), matching useUpdateGroupPosition). Preset
 * contexts are a no-op: the list view only ships on the live route, and preset
 * drafts are property-name-keyed, which this channel-level layer doesn't carry.
 */
export function useCellWriters(): CellWriters {
  const ctx = useEditorContext()

  return useMemo<CellWriters>(() => {
    const writeChannel = (ref: ChannelRef, value: number) => {
      if (ctx.kind === 'cue') {
        lightingApi.cueEdit.send({
          type: 'cueEdit.setChannel',
          cueId: ctx.id,
          universe: ref.universe,
          channel: ref.channelNo,
          level: value,
        })
        return
      }
      if (ctx.kind === 'preset') return
      lightingApi.channels.update(ref.universe, ref.channelNo, value)
    }

    return {
      writeSlider: writeChannel,
      writeSetting: writeChannel,

      writeColour(fixtureKey, property, r, g, b, w, a, uv) {
        if (ctx.kind === 'preset') return
        // A batch commit's white component was chosen against a fixture that
        // HAS a white channel (the picker's pure-white branch emits
        // 0,0,0,w=255). A target without one would otherwise get its RGB
        // zeroed and the white silently skipped — i.e. go black instead of
        // white — so fold the undeliverable white back into RGB.
        if (w !== undefined && w > 0 && !property.whiteChannel) {
          r = Math.max(r, w)
          g = Math.max(g, w)
          b = Math.max(b, w)
        }
        if (ctx.kind === 'cue') {
          lightingApi.cueEdit.send({
            type: 'cueEdit.setProperty',
            cueId: ctx.id,
            targetType: 'fixture',
            targetKey: fixtureKey,
            propertyName: 'rgbColour',
            value: rgbToHex(r, g, b),
          })
        } else {
          lightingApi.channels.update(property.redChannel.universe, property.redChannel.channelNo, r)
          lightingApi.channels.update(property.greenChannel.universe, property.greenChannel.channelNo, g)
          lightingApi.channels.update(property.blueChannel.universe, property.blueChannel.channelNo, b)
        }
        if (property.whiteChannel && w !== undefined) writeChannel(property.whiteChannel, w)
        if (property.amberChannel && a !== undefined) writeChannel(property.amberChannel, a)
        if (property.uvChannel && uv !== undefined) writeChannel(property.uvChannel, uv)
      },

      writePosition(fixtureKey, pan, tilt, panValue, tiltValue) {
        if (ctx.kind === 'preset') return
        if (panValue === undefined && tiltValue === undefined) return
        if (ctx.kind === 'cue') {
          // setProperty('position') takes both axes; fill an omitted one from
          // the fixture's own current value so a pan-only nudge doesn't
          // rewrite tilt.
          const effectivePan = panValue ?? lightingApi.channels.get(pan.universe, pan.channelNo)
          const effectiveTilt = tiltValue ?? lightingApi.channels.get(tilt.universe, tilt.channelNo)
          lightingApi.cueEdit.send({
            type: 'cueEdit.setProperty',
            cueId: ctx.id,
            targetType: 'fixture',
            targetKey: fixtureKey,
            propertyName: 'position',
            value: `${effectivePan},${effectiveTilt}`,
          })
          return
        }
        if (panValue !== undefined) {
          lightingApi.channels.update(pan.universe, pan.channelNo, panValue)
        }
        if (tiltValue !== undefined) {
          lightingApi.channels.update(tilt.universe, tilt.channelNo, tiltValue)
        }
      },
    }
  }, [ctx])
}

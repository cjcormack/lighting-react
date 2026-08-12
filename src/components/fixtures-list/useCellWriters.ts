import { useMemo } from 'react'
import { lightingApi } from '../../api/lightingApi'
import { useEditorContext } from '../../components/lighting-editor/EditorContext'
import { rgbToHex } from '../../components/fx/colourUtils'
import { parseProgrammerValue, serializeLevel } from '../../lib/programmerValue'
import type { PlannedWrite } from './rowModel'
import type { ChannelRef, ColourPropertyDescriptor } from '../../store/fixtures'

export interface CellWriters {
  /** `propertyName` is the backend's own name for the property behind `ref`. */
  writeSlider(fixtureKey: string, propertyName: string, ref: ChannelRef, value: number): void
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
    /** Property names for the pan/tilt axes when they are separate sliders. */
    axisProperties?: { pan?: string; tilt?: string },
  ): void
  writeSetting(fixtureKey: string, propertyName: string, ref: ChannelRef, level: number): void
}

/**
 * EditorContext-aware imperative writers. Unlike useUpdateChannel /
 * useUpdateFixtureColour (which close over one descriptor), these take the
 * target as an argument so a single hook instance serves every cell in the
 * table — batch apply is a loop over these calls.
 *
 * Routing: live → the **programmer** (Layer 2) at property level; cue →
 * cueEdit.setChannel, except RGB (one setProperty('rgbColour') per fixture — the backend
 * rejects per-channel writes on RGB sub-channels) and position (setProperty('position'),
 * matching useUpdateGroupPosition). Preset contexts are a no-op: the list view only ships on
 * the live route, and preset drafts are property-name-keyed, which this channel-level layer
 * doesn't carry.
 *
 * The cue branch still works in channel refs because that is what `cueEdit.setChannel`
 * takes; the live branch works in property names because that is the programmer's key space.
 * Both are passed so neither has to reverse-engineer the other.
 */
/**
 * Dispatch one planned write to the matching writer. The single place that maps a
 * `(target, resolution, commit)` triple onto a writer call — cell edits, batch apply and Fan
 * all funnel through it, so the property names the programmer is keyed by are derived once.
 *
 * Commits whose shape doesn't match the resolution are skipped (planBatchWrites already
 * filters those, but Fan builds its commits directly).
 */
export function applyPlannedWrite(writers: CellWriters, planned: PlannedWrite): void {
  const { target, resolution, commit } = planned
  switch (commit.kind) {
    case 'slider':
      if (resolution.kind === 'slider') {
        writers.writeSlider(target.key, resolution.property.name, resolution.property.channel, commit.value)
      }
      break
    case 'colour':
      if (resolution.kind === 'colour') {
        writers.writeColour(
          target.key,
          resolution.property,
          commit.r,
          commit.g,
          commit.b,
          commit.w,
          commit.a,
          commit.uv,
        )
      }
      break
    case 'position':
      if (resolution.kind === 'position') {
        writers.writePosition(
          target.key,
          resolution.pan,
          resolution.tilt,
          commit.pan,
          commit.tilt,
          // Present only when the position was paired from two axis sliders; a real
          // `position` descriptor writes both axes as one entry instead.
          resolution.property
            ? undefined
            : { pan: resolution.panProperty?.name, tilt: resolution.tiltProperty?.name },
        )
      }
      break
    case 'setting':
      if (resolution.kind === 'setting' || resolution.kind === 'colour-setting') {
        writers.writeSetting(
          target.key,
          resolution.property.name,
          resolution.property.channel,
          commit.level,
        )
      }
      break
  }
}

export function useCellWriters(): CellWriters {
  const ctx = useEditorContext()

  return useMemo<CellWriters>(() => {
    const writeChannelValue = (
      fixtureKey: string,
      propertyName: string,
      ref: ChannelRef,
      value: number,
    ) => {
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
      lightingApi.programmer.set('fixture', fixtureKey, propertyName, serializeLevel(value))
    }

    return {
      writeSlider: writeChannelValue,
      writeSetting: writeChannelValue,

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
          if (property.whiteChannel && w !== undefined) {
            writeChannelValue(fixtureKey, property.name, property.whiteChannel, w)
          }
          if (property.amberChannel && a !== undefined) {
            writeChannelValue(fixtureKey, property.name, property.amberChannel, a)
          }
          if (property.uvChannel && uv !== undefined) {
            writeChannelValue(fixtureKey, property.name, property.uvChannel, uv)
          }
          return
        }
        // Live: one entry for the whole colour, extended components included.
        //
        // A colour entry is atomic — a component the write omits is set to 0, not left alone.
        // So for any channel the fixture actually has, an undefined component is filled from
        // its current value rather than dropped. Without this, callers that legitimately
        // supply only RGB (Fan, which ramps a hue across a selection) would black out the
        // white/amber/UV emitters on every RGBW fixture they touched.
        const current = (ref?: ChannelRef) =>
          ref ? lightingApi.channels.get(ref.universe, ref.channelNo) : undefined
        lightingApi.programmer.setColour('fixture', fixtureKey, property.name, {
          r,
          g,
          b,
          w: property.whiteChannel ? (w ?? current(property.whiteChannel)) : undefined,
          a: property.amberChannel ? (a ?? current(property.amberChannel)) : undefined,
          uv: property.uvChannel ? (uv ?? current(property.uvChannel)) : undefined,
        })
      },

      writePosition(fixtureKey, pan, tilt, panValue, tiltValue, axisProperties) {
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
        if (axisProperties) {
          // Separate pan/tilt sliders: write only the axis that moved. Folding them into a
          // `position` entry would freeze the other axis into the programmer — the reason
          // the backend keeps raw pan/tilt in its channel sideband.
          if (panValue !== undefined && axisProperties.pan) {
            lightingApi.programmer.set(
              'fixture',
              fixtureKey,
              axisProperties.pan,
              serializeLevel(panValue),
            )
          }
          if (tiltValue !== undefined && axisProperties.tilt) {
            lightingApi.programmer.set(
              'fixture',
              fixtureKey,
              axisProperties.tilt,
              serializeLevel(tiltValue),
            )
          }
          return
        }
        // A real `position` property is one atomic entry covering both axes, so a single-axis
        // nudge has to supply the other one. Prefer the axis the programmer already holds
        // over the live wire value: if an effect is driving the untouched axis, the wire is a
        // moving target and sampling it bakes in whatever instant the pointer happened to
        // land on. (Taking the whole position is the console-normal consequence of touching
        // one axis; what we avoid here is freezing it to an arbitrary sample.)
        const held = lightingApi.programmer.getKeyState(fixtureKey, 'position').entry
        const heldPosition = held ? parseProgrammerValue(held.value) : null
        const staged = heldPosition?.kind === 'position' ? heldPosition : null
        const effectivePan =
          panValue ?? staged?.pan ?? lightingApi.channels.get(pan.universe, pan.channelNo)
        const effectiveTilt =
          tiltValue ?? staged?.tilt ?? lightingApi.channels.get(tilt.universe, tilt.channelNo)
        lightingApi.programmer.setPosition(
          'fixture',
          fixtureKey,
          Math.round(effectivePan),
          Math.round(effectiveTilt),
        )
      },
    }
  }, [ctx])
}

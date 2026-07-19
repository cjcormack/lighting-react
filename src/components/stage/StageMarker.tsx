import { useMemo } from 'react'
import {
  findColourSource,
  findDimmerProperty,
  findGroupColourSource,
  type Fixture,
  type FixtureTypeInfo,
  type ColourPropertyDescriptor,
  type SettingPropertyDescriptor,
  type SliderPropertyDescriptor,
} from '../../store/fixtures'
import type { GroupColourPropertyDescriptor } from '../../api/groupsApi'
import {
  useColourValue,
  useSettingColourPreview,
} from '../../hooks/usePropertyValues'
import { useGroupColourValues } from '../../hooks/useGroupPropertyValues'
import { colourFactor, useNormalizedIntensity } from '../../hooks/useNormalizedIntensity'
import { computeNormalizedHueCss, perceptualBrightness } from '@/lib/colourMath'
import { findGel } from '../../data/gels'
import type { FixturePatch } from '../../api/patchApi'
import { cn } from '@/lib/utils'

const DEFAULT_BEAM_DEG = 30

interface StageMarkerProps {
  patch: FixturePatch
  fixture: Fixture | undefined
  fixtureType: FixtureTypeInfo | undefined
  selected: boolean
  dimmed: boolean
  beamScale?: number
}

export function StageMarker(props: StageMarkerProps) {
  const { patch, fixture, fixtureType, selected, dimmed, beamScale = 1 } = props

  // Each leaf component below calls the exact hook set its colour-source
  // variant needs, so the discriminator is resolved here (not via hooks).
  const colourSource = useMemo(
    () => (fixture?.properties ? findColourSource(fixture.properties) : undefined),
    [fixture?.properties],
  )
  const groupColour = useMemo(() => findGroupColourSource(fixture), [fixture])
  const dimmerProp = useMemo(
    () => findDimmerProperty(fixture?.properties),
    [fixture?.properties],
  )
  const gel = !colourSource && fixtureType?.acceptsGel && patch.gelCode
    ? findGel(patch.gelCode)
    : null

  const showCone = !!fixtureType?.acceptsBeamAngle
  const beamDeg = patch.beamAngleDeg ?? DEFAULT_BEAM_DEG

  const labelClass = cn(
    'mt-1 flex items-center gap-1 whitespace-nowrap text-[10px] font-medium',
    selected ? 'text-foreground' : 'text-muted-foreground',
  )

  const wrapperStyle = {
    opacity: dimmed ? 0.25 : 1,
  }

  const renderLabel = (
    <div className={labelClass} style={{ textShadow: '0 0 4px rgba(0,0,0,0.7)' }}>
      <span>{patch.displayName}</span>
      {patch.riggingPosition && (
        <span
          className="rounded-sm px-1 py-px text-[9px] font-mono"
          style={{
            backgroundColor: 'rgba(240,196,111,0.12)',
            border: '1px solid rgba(240,196,111,0.3)',
            color: '#f0c46f',
          }}
        >
          {patch.riggingPosition}
        </span>
      )}
    </div>
  )

  const commonProps = {
    selected,
    showCone,
    beamDeg,
    beamScale,
    label: renderLabel,
    wrapperStyle,
  }

  if (!fixture) {
    return <PlaceholderMarker {...commonProps} />
  }

  if (groupColour && groupColour.memberColourChannels.length > 1) {
    return (
      <MultiPixelMarker
        {...commonProps}
        groupColourProp={groupColour}
        dimmerProp={dimmerProp}
      />
    )
  }

  if (colourSource?.type === 'colour') {
    return (
      <ColourMarker
        {...commonProps}
        colourProp={colourSource.property}
        dimmerProp={dimmerProp}
      />
    )
  }

  if (colourSource?.type === 'setting') {
    return (
      <SettingColourMarker
        {...commonProps}
        settingProp={colourSource.property}
        dimmerProp={dimmerProp}
      />
    )
  }

  if (gel) {
    return (
      <GelMarker
        {...commonProps}
        gelHex={gel.color}
        dimmerProp={dimmerProp}
      />
    )
  }

  return (
    <DimmerOnlyMarker
      {...commonProps}
      dimmerProp={dimmerProp}
    />
  )
}

interface LeafProps {
  selected: boolean
  showCone: boolean
  beamDeg: number
  beamScale: number
  label: React.ReactNode
  wrapperStyle: React.CSSProperties
}

function ColourMarker({
  colourProp,
  dimmerProp,
  ...rest
}: LeafProps & {
  colourProp: ColourPropertyDescriptor
  dimmerProp?: SliderPropertyDescriptor
}) {
  const colour = useColourValue(colourProp)
  // Effective intensity = dimmer × colour so a colour-only fixture at RGB 0
  // reads as dark and doesn't beam. Colour drives the hue at full brightness;
  // `intensity` (curved perceptually in MarkerVisual) drives how lit it looks,
  // so a dimmerless fixture at r:20 reads as dim orange, not near-black.
  const intensity =
    useNormalizedIntensity(dimmerProp) *
    colourFactor(colour.r, colour.g, colour.b, colour.w, colour.a, colour.uv)
  const hue = computeNormalizedHueCss(colour.r, colour.g, colour.b, colour.w, colour.a, colour.uv)
  return <MarkerVisual {...rest} color={hue} intensity={intensity} />
}

function SettingColourMarker({
  settingProp,
  dimmerProp,
  ...rest
}: LeafProps & {
  settingProp: SettingPropertyDescriptor
  dimmerProp?: SliderPropertyDescriptor
}) {
  const preview = useSettingColourPreview(settingProp)
  const intensity = useNormalizedIntensity(dimmerProp) * (preview ? 1 : 0)
  return <MarkerVisual {...rest} color={preview ?? '#888888'} intensity={intensity} />
}

function GelMarker({
  gelHex,
  dimmerProp,
  ...rest
}: LeafProps & {
  gelHex: string
  dimmerProp?: SliderPropertyDescriptor
}) {
  const intensity = useNormalizedIntensity(dimmerProp)
  return <MarkerVisual {...rest} color={gelHex} intensity={intensity} />
}

function DimmerOnlyMarker({
  dimmerProp,
  ...rest
}: LeafProps & {
  dimmerProp?: SliderPropertyDescriptor
}) {
  const intensity = useNormalizedIntensity(dimmerProp)
  return <MarkerVisual {...rest} color="#fff8d5" intensity={intensity} />
}

function PlaceholderMarker(rest: LeafProps) {
  return <MarkerVisual {...rest} color="#666" intensity={0.2} />
}

type PixelSegment = { css: string; intensity: number }

// Multi-element fixture: a compact segmented strip (one cell per element)
// coloured per-pixel, with the aggregate colour driving the glow/beam.
function MultiPixelMarker({
  groupColourProp,
  dimmerProp,
  ...rest
}: LeafProps & {
  groupColourProp: GroupColourPropertyDescriptor
  dimmerProp?: SliderPropertyDescriptor
}) {
  const group = useGroupColourValues(groupColourProp)
  const dimmerFactor = useNormalizedIntensity(dimmerProp)
  const intensity = group.beamIntensity * dimmerFactor
  const aggColor = computeNormalizedHueCss(group.beamR, group.beamG, group.beamB)
  // Per-pixel: full-brightness hue + its own level, so dim pixels still read as
  // their colour (MarkerVisual curves the level into the segment opacity).
  const segments: PixelSegment[] = group.members.map((m) => ({
    css: computeNormalizedHueCss(m.r, m.g, m.b, m.w, m.a, m.uv),
    intensity: colourFactor(m.r, m.g, m.b, m.w, m.a, m.uv) * dimmerFactor,
  }))
  return <MarkerVisual {...rest} color={aggColor} intensity={intensity} segments={segments} />
}

/**
 * Apply an alpha to a marker colour. `color` may be a hex (`#fff8d5`, `#666`)
 * from gel/setting/placeholder markers or an `rgb(r, g, b)` string from
 * computeNormalizedHueCss — so a bare hex suffix like `${color}aa` silently
 * produces an invalid token (`rgb(255, 26, 0)aa`) and drops the whole box-shadow
 * / gradient for rgb() markers. Returns an `rgba(...)` string valid for both.
 */
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    let hex = color.slice(1)
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
    const n = parseInt(hex, 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
  }
  const m = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
  return m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})` : color
}

function MarkerVisual({
  color,
  intensity,
  selected,
  showCone,
  beamDeg,
  beamScale,
  label,
  wrapperStyle,
  segments,
}: LeafProps & { color: string; intensity: number; segments?: PixelSegment[] }) {
  const glowSize = 16 * beamScale
  const coneWidth = beamDeg * 1.6 * beamScale
  // Beam-visibility gate stays on the raw level, so a near-off fixture still
  // throws no beam even though the curve lifts how bright the dot looks.
  const showBeam = showCone && intensity > 0.05
  // Perceptual display brightness: linear opacity crushes dim fixtures to
  // invisible even though the real light is clearly lit.
  const lit = perceptualBrightness(intensity)

  // Border + glow + opacity are shared by the single dot and the pixel strip;
  // only the shape/size differs.
  const frameStyle: React.CSSProperties = {
    border: selected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
    boxShadow: `0 0 ${4 + lit * 18}px ${color}, 0 0 ${8 + lit * 30}px ${withAlpha(color, 0.67)}`,
    opacity: 0.3 + lit * 0.7,
  }

  return (
    <div className="relative flex flex-col items-center" style={wrapperStyle}>
      {showBeam && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translateX(-50%)',
            width: `${coneWidth}px`,
            height: '100px',
            background: `radial-gradient(ellipse at 50% 0%, ${withAlpha(color, 0.8)} 0%, ${withAlpha(color, 0.33)} 25%, transparent 65%)`,
            filter: 'blur(6px)',
            opacity: lit,
            zIndex: -1,
          }}
        />
      )}
      {segments ? (
        <div
          className="flex overflow-hidden rounded-sm"
          style={{
            ...frameStyle,
            width: `${Math.max(glowSize, segments.length * 4)}px`,
            height: `${Math.max(7, glowSize * 0.55)}px`,
          }}
        >
          {segments.map((seg, i) => (
            <div
              key={i}
              style={{ flex: 1, backgroundColor: seg.css, opacity: 0.25 + perceptualBrightness(seg.intensity) * 0.75 }}
            />
          ))}
        </div>
      ) : (
        <div
          className="rounded-full"
          style={{ ...frameStyle, width: `${glowSize}px`, height: `${glowSize}px`, backgroundColor: color }}
        />
      )}
      {label}
    </div>
  )
}

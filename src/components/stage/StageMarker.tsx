import { useMemo } from 'react'
import {
  findColourSource,
  findDimmerProperty,
  type Fixture,
  type FixtureTypeInfo,
  type ColourPropertyDescriptor,
  type SettingPropertyDescriptor,
  type SliderPropertyDescriptor,
} from '../../store/fixtures'
import {
  useColourValue,
  useSettingColourPreview,
} from '../../hooks/usePropertyValues'
import { useNormalizedIntensity } from '../../hooks/useNormalizedIntensity'
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
  const intensity = useNormalizedIntensity(dimmerProp)
  return <MarkerVisual {...rest} color={colour.combinedCss} intensity={intensity} />
}

function SettingColourMarker({
  settingProp,
  dimmerProp,
  ...rest
}: LeafProps & {
  settingProp: SettingPropertyDescriptor
  dimmerProp?: SliderPropertyDescriptor
}) {
  const preview = useSettingColourPreview(settingProp) ?? '#888888'
  const intensity = useNormalizedIntensity(dimmerProp)
  return <MarkerVisual {...rest} color={preview} intensity={intensity} />
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

function MarkerVisual({
  color,
  intensity,
  selected,
  showCone,
  beamDeg,
  beamScale,
  label,
  wrapperStyle,
}: LeafProps & { color: string; intensity: number }) {
  const glowSize = 16 * beamScale
  const coneWidth = beamDeg * 1.6 * beamScale
  const opacity = 0.3 + intensity * 0.7
  const showBeam = showCone && intensity > 0.05

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
            background: `radial-gradient(ellipse at 50% 0%, ${color}cc 0%, ${color}55 25%, transparent 65%)`,
            filter: 'blur(6px)',
            opacity: intensity,
            zIndex: -1,
          }}
        />
      )}
      <div
        className="rounded-full"
        style={{
          width: `${glowSize}px`,
          height: `${glowSize}px`,
          backgroundColor: color,
          border: selected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
          boxShadow: `0 0 ${4 + intensity * 18}px ${color}, 0 0 ${8 + intensity * 30}px ${color}aa`,
          opacity,
        }}
      />
      {label}
    </div>
  )
}

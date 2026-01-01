import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { useFixtureListQuery, findColourSource, type Fixture, type ColourPropertyDescriptor, type SliderPropertyDescriptor, type SettingPropertyDescriptor } from '../../store/fixtures'
import { useColourValue, useSliderValue, useSettingColourPreview } from '../../hooks/usePropertyValues'

interface CompactFixtureCardProps {
  fixtureKey: string
  fixtureName: string
  tags: string[]
  onClick: () => void
}

export const CompactFixtureCard = memo(function CompactFixtureCard({
  fixtureKey,
  fixtureName,
  tags,
  onClick,
}: CompactFixtureCardProps) {
  const { data: fixtureList } = useFixtureListQuery()
  const fixture = fixtureList?.find((f) => f.key === fixtureKey)

  const isElement = tags.includes('element')

  if (!fixture) {
    return (
      <div
        className="p-2 border rounded cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={onClick}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-muted shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{fixtureName}</p>
            {isElement && (
              <Badge variant="outline" className="text-xs">
                Element
              </Badge>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="p-2 border rounded cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <FixtureColourIndicator fixture={fixture} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{fixture.name}</p>
          {isElement && (
            <Badge variant="outline" className="text-xs">
              Element
            </Badge>
          )}
        </div>
        <DimmerBadge fixture={fixture} />
      </div>
    </div>
  )
})

/**
 * Shows colour swatch or dimmer bar indicator
 */
function FixtureColourIndicator({ fixture }: { fixture: Fixture }) {
  const colourSource = fixture.properties ? findColourSource(fixture.properties) : undefined

  if (colourSource?.type === 'colour') {
    return <ColourSwatchIndicator colourProp={colourSource.property} />
  }

  if (colourSource?.type === 'setting') {
    return <SettingColourIndicator settingProp={colourSource.property} />
  }

  // Fallback: show dimmer bar
  const dimmerProp = fixture.properties?.find(
    (p) => p.type === 'slider' && p.category === 'dimmer'
  ) as SliderPropertyDescriptor | undefined

  if (dimmerProp) {
    return <DimmerBarIndicator dimmerProp={dimmerProp} />
  }

  return <div className="w-6 h-6 rounded bg-muted shrink-0" />
}

function ColourSwatchIndicator({ colourProp }: { colourProp: ColourPropertyDescriptor }) {
  const colour = useColourValue(colourProp)
  return (
    <div
      className="w-6 h-6 rounded border shrink-0"
      style={{ backgroundColor: colour.combinedCss }}
    />
  )
}

function SettingColourIndicator({ settingProp }: { settingProp: SettingPropertyDescriptor }) {
  const colourPreview = useSettingColourPreview(settingProp)
  return (
    <div
      className="w-6 h-6 rounded border shrink-0"
      style={{ backgroundColor: colourPreview ?? 'transparent' }}
    />
  )
}

function DimmerBarIndicator({ dimmerProp }: { dimmerProp: SliderPropertyDescriptor }) {
  const value = useSliderValue(dimmerProp)
  const pct = Math.round((value / 255) * 100)
  return (
    <div className="w-6 h-6 flex items-end shrink-0 border rounded overflow-hidden bg-muted">
      <div className="w-full bg-primary" style={{ height: `${pct}%` }} />
    </div>
  )
}

function DimmerBadge({ fixture }: { fixture: Fixture }) {
  const dimmerProp = fixture.properties?.find(
    (p) => p.type === 'slider' && p.category === 'dimmer'
  ) as SliderPropertyDescriptor | undefined

  if (!dimmerProp) return null

  return <DimmerValue dimmerProp={dimmerProp} />
}

function DimmerValue({ dimmerProp }: { dimmerProp: SliderPropertyDescriptor }) {
  const value = useSliderValue(dimmerProp)
  const pct = Math.round((value / 255) * 100)
  return (
    <span className="text-xs text-muted-foreground tabular-nums w-8 text-right shrink-0">
      {pct}%
    </span>
  )
}

/**
 * Compact card for multi-element fixtures showing aggregate view
 */
interface MultiElementCompactCardProps {
  parentKey: string
  elementCount: number
  onClick: () => void
}

export const MultiElementCompactCard = memo(function MultiElementCompactCard({
  parentKey,
  elementCount,
  onClick,
}: MultiElementCompactCardProps) {
  const { data: fixtureList } = useFixtureListQuery()
  const fixture = fixtureList?.find((f) => f.key === parentKey)

  if (!fixture) {
    return (
      <div
        className="p-2 border rounded cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={onClick}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-muted shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{parentKey}</p>
            <Badge variant="secondary" className="text-xs">
              {elementCount} heads
            </Badge>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="p-2 border rounded cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <MultiHeadColourIndicator fixture={fixture} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{fixture.name}</p>
          <Badge variant="secondary" className="text-xs">
            {elementCount} heads
          </Badge>
        </div>
        <DimmerBadge fixture={fixture} />
      </div>
    </div>
  )
})

/**
 * Shows mini colour dots for each head
 */
function MultiHeadColourIndicator({ fixture }: { fixture: Fixture }) {
  if (!fixture.elements || fixture.elements.length === 0) {
    return <FixtureColourIndicator fixture={fixture} />
  }

  const maxDots = 4
  const showElements = fixture.elements.slice(0, maxDots)
  const extraCount = fixture.elements.length - maxDots

  return (
    <div className="flex gap-0.5 shrink-0 items-center">
      {showElements.map((element) => {
        const colourSource = findColourSource(element.properties)
        if (!colourSource) {
          return <div key={element.key} className="w-3 h-3 rounded-full bg-muted" />
        }
        if (colourSource.type === 'colour') {
          return <ElementColourDot key={element.key} colourProp={colourSource.property} />
        }
        return <ElementSettingColourDot key={element.key} settingProp={colourSource.property} />
      })}
      {extraCount > 0 && (
        <span className="text-xs text-muted-foreground ml-0.5">+{extraCount}</span>
      )}
    </div>
  )
}

function ElementColourDot({ colourProp }: { colourProp: ColourPropertyDescriptor }) {
  const colour = useColourValue(colourProp)
  return (
    <div
      className="w-3 h-3 rounded-full border"
      style={{ backgroundColor: colour.combinedCss }}
    />
  )
}

function ElementSettingColourDot({ settingProp }: { settingProp: SettingPropertyDescriptor }) {
  const colourPreview = useSettingColourPreview(settingProp)
  return (
    <div
      className="w-3 h-3 rounded-full border"
      style={{ backgroundColor: colourPreview ?? 'transparent' }}
    />
  )
}

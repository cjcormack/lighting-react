import { useState } from 'react'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Fixture, ElementDescriptor, ColourPropertyDescriptor } from '../../store/fixtures'
import { useGetChannelQuery, useUpdateChannelMutation } from '../../store/channels'
import { useColourValue } from '../../hooks/usePropertyValues'
import { PropertyVisualizer } from './PropertyVisualizers'
import { GroupMembershipSection } from './GroupMembershipSection'
import { cn } from '@/lib/utils'

export type FixtureViewMode = 'properties' | 'channels'

interface FixtureContentProps {
  fixture: Fixture
  isEditing: boolean
  onGroupClick?: (groupName: string) => void
  /** Number of grid columns the card spans (affects channel layout) */
  cardSpan?: number
  /** Which view to display - controlled externally */
  viewMode: FixtureViewMode
}

export function FixtureContent({
  fixture,
  isEditing,
  onGroupClick,
  cardSpan = 1,
  viewMode,
}: FixtureContentProps) {
  const hasElements = (fixture.elements?.length ?? 0) > 0

  if (viewMode === 'channels') {
    return <ChannelsView fixture={fixture} span={cardSpan} isEditing={isEditing} />
  }

  return (
    <PropertiesView
      fixture={fixture}
      hasElements={hasElements}
      isEditing={isEditing}
      onGroupClick={onGroupClick}
    />
  )
}

function PropertiesView({
  fixture,
  hasElements,
  isEditing,
  onGroupClick,
}: {
  fixture: Fixture
  hasElements: boolean
  isEditing: boolean
  onGroupClick?: (groupName: string) => void
}) {
  // Group properties by category for better organization
  const colourProps =
    fixture.properties?.filter((p) => p.type === 'colour') ?? []
  const positionProps =
    fixture.properties?.filter((p) => p.type === 'position') ?? []
  const dimmerProps =
    fixture.properties?.filter(
      (p) => p.type === 'slider' && p.category === 'dimmer'
    ) ?? []
  const otherSliders =
    fixture.properties?.filter(
      (p) => p.type === 'slider' && p.category !== 'dimmer'
    ) ?? []
  const settingProps =
    fixture.properties?.filter((p) => p.type === 'setting') ?? []

  const hasFixtureProperties =
    fixture.properties && fixture.properties.length > 0

  return (
    <div className="space-y-4">
      {/* Fixture-level properties - constrained width for multi-head fixtures */}
      {hasFixtureProperties && (
        <div className={cn('space-y-1', hasElements && 'max-w-sm')}>
          {/* Colour properties first (most visually prominent) */}
          {colourProps.map((prop) => (
            <PropertyVisualizer
              key={prop.name}
              property={prop}
              isEditing={isEditing}
            />
          ))}

          {/* Position properties */}
          {positionProps.map((prop) => (
            <PropertyVisualizer
              key={prop.name}
              property={prop}
              isEditing={isEditing}
            />
          ))}

          {/* Dimmer properties */}
          {dimmerProps.map((prop) => (
            <PropertyVisualizer
              key={prop.name}
              property={prop}
              isEditing={isEditing}
            />
          ))}

          {/* Other slider properties */}
          {otherSliders.map((prop) => (
            <PropertyVisualizer
              key={prop.name}
              property={prop}
              isEditing={isEditing}
            />
          ))}

          {/* Setting properties */}
          {settingProps.map((prop) => (
            <PropertyVisualizer
              key={prop.name}
              property={prop}
              isEditing={isEditing}
            />
          ))}
        </div>
      )}

      {/* Groups section - show which groups this fixture belongs to */}
      {onGroupClick && fixture.groups && fixture.groups.length > 0 && (
        <GroupMembershipSection
          groups={fixture.groups}
          onGroupClick={onGroupClick}
        />
      )}

      {/* Per-head properties */}
      {hasElements && fixture.elements && (
        <>
          {(hasFixtureProperties || (fixture.groups && fixture.groups.length > 0)) && (
            <div className="border-t pt-3">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Heads ({fixture.elements.length})
              </h4>
            </div>
          )}
          <ElementsView elements={fixture.elements} isEditing={isEditing} />
        </>
      )}

      {!hasFixtureProperties && !hasElements && (
        <p className="text-sm text-muted-foreground">No properties available</p>
      )}
    </div>
  )
}

/** Expandable accordion-style elements view */
function ElementsView({
  elements,
  isEditing,
}: {
  elements: ElementDescriptor[]
  isEditing: boolean
}) {
  const [expandedHead, setExpandedHead] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      {/* Aggregate colour preview */}
      <HeadsAggregatePreview elements={elements} />

      {/* Expandable head sections */}
      {elements.map((element) => (
        <div key={element.key} className="border rounded">
          <button
            className="w-full p-2 flex items-center justify-between hover:bg-accent/50 transition-colors"
            onClick={() =>
              setExpandedHead(expandedHead === element.key ? null : element.key)
            }
          >
            <div className="flex items-center gap-2">
              <HeadColourPreview element={element} />
              <span className="text-sm font-medium">{element.displayName}</span>
            </div>
            {expandedHead === element.key ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>

          {expandedHead === element.key && (
            <div className="p-3 pt-0 border-t">
              <PropertiesList properties={element.properties} isEditing={isEditing} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Shows combined colour swatches for all heads in a row */
function HeadsAggregatePreview({ elements }: { elements: ElementDescriptor[] }) {
  return (
    <div className="flex gap-1 mb-3 p-2 bg-muted/50 rounded">
      <span className="text-xs text-muted-foreground mr-2 self-center">Preview:</span>
      {elements.map((element) => (
        <HeadColourPreview key={element.key} element={element} size="md" />
      ))}
    </div>
  )
}

function HeadColourPreview({
  element,
  size = 'sm',
}: {
  element: ElementDescriptor
  size?: 'sm' | 'md'
}) {
  const colourProp = element.properties.find((p) => p.type === 'colour') as
    | ColourPropertyDescriptor
    | undefined

  if (!colourProp) {
    return (
      <div
        className={cn(
          'rounded bg-muted',
          size === 'sm' ? 'w-6 h-6' : 'w-8 h-8'
        )}
        title={element.displayName}
      />
    )
  }

  return <HeadColourDot colourProp={colourProp} title={element.displayName} size={size} />
}

function HeadColourDot({
  colourProp,
  title,
  size,
}: {
  colourProp: ColourPropertyDescriptor
  title: string
  size: 'sm' | 'md'
}) {
  const colour = useColourValue(colourProp)
  return (
    <div
      className={cn(
        'rounded border',
        size === 'sm' ? 'w-6 h-6' : 'w-8 h-8'
      )}
      style={{ backgroundColor: colour.combinedCss }}
      title={title}
    />
  )
}

/** Renders properties organized by category */
function PropertiesList({
  properties,
  isEditing,
}: {
  properties: ElementDescriptor['properties']
  isEditing: boolean
}) {
  if (!properties || properties.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No properties available</p>
    )
  }

  // Group by category
  const colourProps = properties.filter((p) => p.type === 'colour')
  const positionProps = properties.filter((p) => p.type === 'position')
  const dimmerProps = properties.filter(
    (p) => p.type === 'slider' && p.category === 'dimmer'
  )
  const otherSliders = properties.filter(
    (p) => p.type === 'slider' && p.category !== 'dimmer'
  )
  const settingProps = properties.filter((p) => p.type === 'setting')

  return (
    <div className="space-y-1">
      {colourProps.map((prop) => (
        <PropertyVisualizer key={prop.name} property={prop} isEditing={isEditing} />
      ))}
      {positionProps.map((prop) => (
        <PropertyVisualizer key={prop.name} property={prop} isEditing={isEditing} />
      ))}
      {dimmerProps.map((prop) => (
        <PropertyVisualizer key={prop.name} property={prop} isEditing={isEditing} />
      ))}
      {otherSliders.map((prop) => (
        <PropertyVisualizer key={prop.name} property={prop} isEditing={isEditing} />
      ))}
      {settingProps.map((prop) => (
        <PropertyVisualizer key={prop.name} property={prop} isEditing={isEditing} />
      ))}
    </div>
  )
}

function ChannelsView({
  fixture,
  span,
  isEditing,
}: {
  fixture: Fixture
  span: number
  isEditing: boolean
}) {
  // Max columns based on card span
  const maxColumns = Math.min(span, 3)

  // Split channels into columns for vertical ordering
  const channelCount = fixture.channels.length
  const rowsPerColumn = Math.ceil(channelCount / maxColumns)

  const columns: typeof fixture.channels[] = []
  for (let i = 0; i < maxColumns; i++) {
    columns.push(fixture.channels.slice(i * rowsPerColumn, (i + 1) * rowsPerColumn))
  }

  return (
    <div
      className={cn(
        'grid gap-x-4',
        'grid-cols-1',
        maxColumns >= 2 && 'md:grid-cols-2',
        maxColumns >= 3 && 'xl:grid-cols-3'
      )}
    >
      {columns.map((columnChannels, colIndex) => (
        <div key={colIndex} className="min-w-0">
          {columnChannels.map((channel) => (
            <ChannelSlider
              key={channel.channelNo}
              universe={fixture.universe}
              id={channel.channelNo}
              description={channel.description}
              isEditing={isEditing}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function ChannelSlider({
  universe,
  id,
  description,
  isEditing,
}: {
  universe: number
  id: number
  description?: string
  isEditing: boolean
}) {
  const { data: maybeValue } = useGetChannelQuery({
    universe: universe,
    channelNo: id,
  })

  const value = maybeValue || 0
  const percentage = Math.round((value / 255) * 100)

  const [runUpdateChannelMutation] = useUpdateChannelMutation()

  const setValue = (value: number) => {
    runUpdateChannelMutation({
      universe: universe,
      channelNo: id,
      value: value,
    })
  }

  const handleSliderChange = (values: number[]) => {
    if (values[0] !== undefined) {
      setValue(values[0])
    }
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.value === '') {
      setValue(0)
      return
    }

    const valueNumber = Number(event.target.value)
    if (isNaN(valueNumber)) {
      return
    } else if (valueNumber < 0) {
      setValue(0)
    } else if (valueNumber > 255) {
      setValue(255)
    } else {
      setValue(valueNumber)
    }
  }

  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium w-6 shrink-0 text-muted-foreground">
          {id}
        </span>
        <span
          className="text-xs truncate w-16 sm:w-28 min-w-0"
          title={description}
        >
          {description || `Ch ${id}`}
        </span>
        {isEditing ? (
          <>
            <Slider
              className="flex-1 min-w-12 shrink-0"
              value={[value]}
              max={255}
              step={1}
              onValueChange={handleSliderChange}
            />
            <Input
              type="number"
              value={value}
              onChange={handleInputChange}
              min={0}
              max={255}
              className="w-12 sm:w-14 h-7 text-xs px-1 shrink-0"
            />
          </>
        ) : (
          <>
            <div className="flex-1 min-w-12 shrink-0 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="w-8 sm:w-10 text-xs text-right text-muted-foreground shrink-0">
              {value}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

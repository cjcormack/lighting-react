import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useFixtureListQuery, type Fixture, type ElementDescriptor, type PropertyDescriptor, type ColourPropertyDescriptor } from '../../store/fixtures'
import { PropertyVisualizer } from '../fixtures/PropertyVisualizers'
import { useColourValue } from '../../hooks/usePropertyValues'
import { cn } from '@/lib/utils'

interface FixtureDetailModalProps {
  fixtureKey: string | null
  onClose: () => void
}

export function FixtureDetailModal({ fixtureKey, onClose }: FixtureDetailModalProps) {
  const { data: fixtureList } = useFixtureListQuery()
  const fixture = fixtureKey ? fixtureList?.find((f) => f.key === fixtureKey) : null
  const [isEditing, setIsEditing] = useState(false)

  // Reset edit mode when modal closes or fixture changes
  useEffect(() => {
    setIsEditing(false)
  }, [fixtureKey])

  const hasElements = (fixture?.elements?.length ?? 0) > 0

  return (
    <Dialog open={fixtureKey !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <div>
              <DialogTitle>{fixture?.name ?? 'Fixture'}</DialogTitle>
              {fixture && (fixture.manufacturer || fixture.model) && (
                <p className="text-sm text-muted-foreground">
                  {[fixture.manufacturer, fixture.model].filter(Boolean).join(' ')}
                </p>
              )}
            </div>
            <Button
              variant={isEditing ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? 'Done' : 'Edit'}
            </Button>
          </div>

          {/* Capability badges */}
          {fixture && (
            <div className="flex flex-wrap gap-1 mt-2">
              {hasElements && (
                <Badge variant="secondary">{fixture.elements!.length} heads</Badge>
              )}
              {fixture.mode && (
                <Badge variant="outline">{fixture.mode.modeName}</Badge>
              )}
              {fixture.capabilities?.map((cap) => (
                <Badge key={cap} variant="outline" className="capitalize">
                  {cap}
                </Badge>
              ))}
            </div>
          )}
        </DialogHeader>

        {fixture && (
          <FixtureDetailContent
            fixture={fixture}
            isEditing={isEditing}
            hasElements={hasElements}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function FixtureDetailContent({
  fixture,
  isEditing,
  hasElements,
}: {
  fixture: Fixture
  isEditing: boolean
  hasElements: boolean
}) {
  const hasFixtureProperties = fixture.properties && fixture.properties.length > 0

  // For single-element fixtures: show all properties directly
  if (!hasElements) {
    return (
      <div className="space-y-2">
        <PropertiesList properties={fixture.properties} isEditing={isEditing} />
      </div>
    )
  }

  // For multi-head fixtures: show fixture-level props + expandable heads
  return (
    <div className="space-y-4">
      {/* Fixture-level properties */}
      {hasFixtureProperties && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Fixture Controls</h4>
          <PropertiesList properties={fixture.properties} isEditing={isEditing} />
        </div>
      )}

      {/* Multi-head section */}
      <div className={cn(hasFixtureProperties && 'border-t pt-4')}>
        <h4 className="text-sm font-medium mb-3">Heads ({fixture.elements!.length})</h4>
        <MultiHeadView elements={fixture.elements!} isEditing={isEditing} />
      </div>
    </div>
  )
}

function MultiHeadView({
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

/**
 * Shows combined colour swatches for all heads in a row
 */
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

/**
 * Renders properties organized by category
 */
function PropertiesList({
  properties,
  isEditing,
}: {
  properties: PropertyDescriptor[]
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

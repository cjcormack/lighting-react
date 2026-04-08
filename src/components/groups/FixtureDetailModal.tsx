import { useState, useEffect } from 'react'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Settings2, SlidersHorizontal } from 'lucide-react'
import { useFixtureListQuery } from '../../store/fixtures'
import { FixtureContent, FixtureViewMode } from '../fixtures/FixtureContent'
import { FixtureParkButton } from '../fixtures/FixtureParkButton'

interface FixtureDetailModalProps {
  fixtureKey: string | null
  onClose: () => void
  /** When provided, uses this edit state and hides the Edit button */
  isEditing?: boolean
}

export function FixtureDetailModal({ fixtureKey, onClose, isEditing: externalIsEditing }: FixtureDetailModalProps) {
  const { data: fixtureList } = useFixtureListQuery()
  const fixture = fixtureKey ? fixtureList?.find((f) => f.key === fixtureKey) : null
  const [internalIsEditing, setInternalIsEditing] = useState(false)
  const [viewMode, setViewMode] = useState<FixtureViewMode>('properties')

  // Use external edit state if provided, otherwise use internal state
  const isEditing = externalIsEditing ?? internalIsEditing
  const showEditButton = externalIsEditing === undefined

  // Reset edit mode and view mode when modal closes or fixture changes
  useEffect(() => {
    setInternalIsEditing(false)
    setViewMode('properties')
  }, [fixtureKey])

  const hasElements = (fixture?.elements?.length ?? 0) > 0

  return (
    <Sheet open={fixtureKey !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex flex-col sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-center justify-between pr-8">
            <div>
              <SheetTitle>{fixture?.name ?? 'Fixture'}</SheetTitle>
              {fixture && (fixture.manufacturer || fixture.model) && (
                <p className="text-sm text-muted-foreground">
                  {[fixture.manufacturer, fixture.model].filter(Boolean).join(' ')}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(value) => value && setViewMode(value as FixtureViewMode)}
                size="sm"
              >
                <ToggleGroupItem value="properties" aria-label="Show properties" title="Properties">
                  <Settings2 className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="channels" aria-label="Show channels" title="Channels">
                  <SlidersHorizontal className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
              {fixture && <FixtureParkButton fixture={fixture} />}
              {showEditButton && (
                <Button
                  variant={isEditing ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setInternalIsEditing(!internalIsEditing)}
                >
                  {isEditing ? 'Done' : 'Edit'}
                </Button>
              )}
            </div>
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
        </SheetHeader>

        <SheetBody>
        {fixture && (
          <FixtureContent
            fixture={fixture}
            isEditing={isEditing}
            viewMode={viewMode}
          />
        )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

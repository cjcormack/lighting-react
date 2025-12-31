import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useFixtureListQuery } from '../../store/fixtures'
import { FixtureContent } from '../fixtures/FixtureContent'

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
          <FixtureContent
            fixture={fixture}
            isEditing={isEditing}
            cardSpan={2}
            variant="modal"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

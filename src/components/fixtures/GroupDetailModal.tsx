import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { useGroupListQuery, useGroupQuery, useGroupPropertiesQuery } from '../../store/groups'
import { GroupPropertiesSection } from '../groups/GroupCard'
import { GroupMembersSection } from '../groups/GroupMembersSection'
import { FixtureDetailModal } from '../groups/FixtureDetailModal'

interface GroupDetailModalProps {
  groupName: string | null
  onClose: () => void
}

export function GroupDetailModal({
  groupName,
  onClose,
}: GroupDetailModalProps) {
  const { data: groupList } = useGroupListQuery()
  const group = groupName ? groupList?.find((g) => g.name === groupName) : null
  const { data: groupDetail, isLoading: membersLoading } = useGroupQuery(groupName ?? '', {
    skip: !groupName,
  })
  const { data: properties, isLoading: propertiesLoading } = useGroupPropertiesQuery(
    groupName ?? '',
    { skip: !groupName }
  )
  const [isEditing, setIsEditing] = useState(false)
  const [selectedFixture, setSelectedFixture] = useState<string | null>(null)

  // Reset edit mode when modal closes or group changes
  useEffect(() => {
    setIsEditing(false)
    setSelectedFixture(null)
  }, [groupName])

  return (
    <Dialog open={groupName !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <div>
              <DialogTitle>{group?.name ?? 'Group'}</DialogTitle>
              {group && (
                <p className="text-sm text-muted-foreground">
                  {group.memberCount} fixture{group.memberCount !== 1 ? 's' : ''}
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
          {group && group.capabilities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {group.capabilities.map((cap) => (
                <Badge key={cap} variant="outline" className="capitalize">
                  {cap}
                </Badge>
              ))}
            </div>
          )}
        </DialogHeader>

        {groupName && (
          <div className="space-y-4">
            {/* Inline properties section */}
            <GroupPropertiesSection
              properties={properties}
              isLoading={propertiesLoading}
              isEditing={isEditing}
            />

            {/* Compact fixture member grid */}
            {membersLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="size-6 animate-spin" />
              </div>
            ) : (
              <GroupMembersSection
                members={groupDetail?.members}
                isLoading={false}
                onFixtureClick={setSelectedFixture}
              />
            )}
          </div>
        )}
      </DialogContent>

      {/* Nested fixture modal */}
      <FixtureDetailModal
        fixtureKey={selectedFixture}
        onClose={() => setSelectedFixture(null)}
      />
    </Dialog>
  )
}

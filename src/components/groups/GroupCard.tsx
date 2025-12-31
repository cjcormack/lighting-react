import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useGroupQuery, useGroupPropertiesQuery } from '../../store/groups'
import { GroupPropertyVisualizer } from '../fixtures/GroupPropertyVisualizers'
import { GroupMembersSection } from './GroupMembersSection'
import type { GroupSummary, GroupPropertyDescriptor } from '../../api/groupsApi'

interface GroupCardProps {
  group: GroupSummary
  onFixtureClick: (fixtureKey: string) => void
}

export function GroupCard({ group, onFixtureClick }: GroupCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const { data: groupDetail, isLoading: membersLoading } = useGroupQuery(group.name)
  const { data: properties, isLoading: propertiesLoading } = useGroupPropertiesQuery(group.name)

  return (
    <Card>
      <GroupCardHeader
        group={group}
        isEditing={isEditing}
        onToggleEdit={() => setIsEditing(!isEditing)}
      />
      <CardContent className="space-y-4">
        {/* Inline properties section */}
        <GroupPropertiesSection
          properties={properties}
          isLoading={propertiesLoading}
          isEditing={isEditing}
        />

        {/* Compact fixture member grid */}
        <GroupMembersSection
          members={groupDetail?.members}
          isLoading={membersLoading}
          onFixtureClick={onFixtureClick}
        />
      </CardContent>
    </Card>
  )
}

function GroupCardHeader({
  group,
  isEditing,
  onToggleEdit,
}: {
  group: GroupSummary
  isEditing: boolean
  onToggleEdit: () => void
}) {
  return (
    <CardHeader className="pb-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-lg truncate">{group.name}</CardTitle>
        </div>
        <Button
          variant={isEditing ? 'default' : 'outline'}
          size="sm"
          onClick={onToggleEdit}
          className="shrink-0"
        >
          {isEditing ? 'Done' : 'Edit'}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1 mt-1">
        <Badge variant="secondary" className="text-xs">
          {group.memberCount} fixture{group.memberCount !== 1 ? 's' : ''}
        </Badge>
        {group.capabilities.map((cap) => (
          <Badge key={cap} variant="outline" className="text-xs capitalize">
            {cap}
          </Badge>
        ))}
      </div>
    </CardHeader>
  )
}

function GroupPropertiesSection({
  properties,
  isLoading,
  isEditing,
}: {
  properties: GroupPropertyDescriptor[] | undefined
  isLoading: boolean
  isEditing: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-2">
        <Loader2 className="size-4 animate-spin" />
      </div>
    )
  }

  if (!properties || properties.length === 0) {
    return null
  }

  const grouped = groupPropertiesByCategory(properties)

  return (
    <div className="space-y-1">
      {/* Colour properties first (most visually prominent) */}
      {grouped.colour.map((prop) => (
        <GroupPropertyVisualizer key={prop.name} property={prop} isEditing={isEditing} />
      ))}

      {/* Position properties */}
      {grouped.position.map((prop) => (
        <GroupPropertyVisualizer key={prop.name} property={prop} isEditing={isEditing} />
      ))}

      {/* Dimmer properties */}
      {grouped.dimmer.map((prop) => (
        <GroupPropertyVisualizer key={prop.name} property={prop} isEditing={isEditing} />
      ))}

      {/* Other slider properties */}
      {grouped.slider.map((prop) => (
        <GroupPropertyVisualizer key={prop.name} property={prop} isEditing={isEditing} />
      ))}

      {/* Setting properties */}
      {grouped.setting.map((prop) => (
        <GroupPropertyVisualizer key={prop.name} property={prop} isEditing={isEditing} />
      ))}
    </div>
  )
}

/**
 * Group properties by category for organized display
 */
function groupPropertiesByCategory(properties: GroupPropertyDescriptor[]) {
  const result = {
    colour: [] as GroupPropertyDescriptor[],
    position: [] as GroupPropertyDescriptor[],
    dimmer: [] as GroupPropertyDescriptor[],
    slider: [] as GroupPropertyDescriptor[],
    setting: [] as GroupPropertyDescriptor[],
  }

  for (const prop of properties) {
    switch (prop.type) {
      case 'colour':
        result.colour.push(prop)
        break
      case 'position':
        result.position.push(prop)
        break
      case 'slider':
        if (prop.category === 'dimmer') {
          result.dimmer.push(prop)
        } else {
          result.slider.push(prop)
        }
        break
      case 'setting':
        result.setting.push(prop)
        break
    }
  }

  return result
}

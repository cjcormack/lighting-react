import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useGroupPropertiesQuery } from '../../store/groups'
import { GroupPropertyVisualizer, GroupVirtualDimmerSlider } from './GroupPropertyVisualizers'
import type { GroupPropertyDescriptor, GroupColourPropertyDescriptor } from '../../api/groupsApi'

interface GroupPropertiesDialogProps {
  groupName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Modal dialog for viewing and editing group properties.
 * Shows aggregated property values across all group members with
 * range/summary display for mixed values.
 */
export function GroupPropertiesDialog({
  groupName,
  open,
  onOpenChange,
}: GroupPropertiesDialogProps) {
  const { data: properties, isLoading, error } = useGroupPropertiesQuery(groupName, {
    skip: !open,
  })
  const [isEditing, setIsEditing] = useState(false)

  // Reset edit mode when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setIsEditing(false)
    }
    onOpenChange(newOpen)
  }

  // Group properties by category for organized display
  const groupedProperties = groupPropertiesByCategory(properties ?? [])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>{groupName} Properties</DialogTitle>
            <Button
              variant={isEditing ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? 'Done' : 'Edit'}
            </Button>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading properties...
          </div>
        ) : error ? (
          <div className="py-8 text-center text-destructive">
            Failed to load properties
          </div>
        ) : properties && properties.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No common properties found across group members
          </div>
        ) : (
          <div className="space-y-4">
            {/* Colour properties first */}
            {groupedProperties.colour.length > 0 && (
              <PropertySection title="Colour" properties={groupedProperties.colour} isEditing={isEditing} />
            )}

            {/* Position properties */}
            {groupedProperties.position.length > 0 && (
              <PropertySection title="Position" properties={groupedProperties.position} isEditing={isEditing} />
            )}

            {/* Dimmer properties */}
            {groupedProperties.dimmer.length > 0 && (
              <PropertySection title="Dimmer" properties={groupedProperties.dimmer} isEditing={isEditing} />
            )}

            {/* Virtual dimmer (colour but no real dimmer) */}
            {groupedProperties.dimmer.length === 0 && groupedProperties.colour.length > 0 && (() => {
              const colourProp = groupedProperties.colour.find(
                (p) => p.type === 'colour'
              ) as GroupColourPropertyDescriptor | undefined
              if (!colourProp) return null
              return (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-xs font-medium">
                      Dimmer
                    </Badge>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      Virtual
                    </Badge>
                  </div>
                  <GroupVirtualDimmerSlider colourProp={colourProp} isEditing={isEditing} />
                </div>
              )
            })()}

            {/* Other sliders */}
            {groupedProperties.slider.length > 0 && (
              <PropertySection title="Controls" properties={groupedProperties.slider} isEditing={isEditing} />
            )}

            {/* Settings */}
            {groupedProperties.setting.length > 0 && (
              <PropertySection title="Settings" properties={groupedProperties.setting} isEditing={isEditing} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Section of properties with a title
 */
function PropertySection({
  title,
  properties,
  isEditing,
}: {
  title: string
  properties: GroupPropertyDescriptor[]
  isEditing: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="outline" className="text-xs font-medium">
          {title}
        </Badge>
      </div>
      <div className="space-y-1">
        {properties.map((prop) => (
          <GroupPropertyVisualizer
            key={prop.name}
            property={prop}
            isEditing={isEditing}
          />
        ))}
      </div>
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

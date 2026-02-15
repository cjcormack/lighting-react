import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AudioWaveform, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { useGroupActiveEffectsQuery } from '@/store/groups'
import type { GroupSummary, GroupActiveEffect } from '@/api/groupsApi'
import { GroupActiveEffectItem } from './GroupActiveEffectItem'
import { AddEditGroupFxSheet } from './AddEditGroupFxSheet'

type SheetState =
  | { mode: 'closed' }
  | { mode: 'add' }
  | { mode: 'edit'; effectId: number; effect: GroupActiveEffect }

interface GroupFxSectionProps {
  group: GroupSummary
}

export function GroupFxSection({ group }: GroupFxSectionProps) {
  const { data: effects, isLoading } = useGroupActiveEffectsQuery(group.name)
  const [isExpanded, setIsExpanded] = useState(false)
  const [sheetState, setSheetState] = useState<SheetState>({ mode: 'closed' })

  const totalCount = effects?.length ?? 0

  if (isLoading) return null

  return (
    <div className="pt-3 border-t">
      <button
        className="w-full flex items-center justify-between text-sm"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <AudioWaveform className="size-4 text-muted-foreground" />
          <h4 className="font-medium text-muted-foreground">Effects</h4>
          {totalCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalCount}
            </Badge>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-2">
          {effects?.map((effect) => (
            <GroupActiveEffectItem
              key={effect.id}
              effect={effect}
              groupName={group.name}
              onEdit={() =>
                setSheetState({ mode: 'edit', effectId: effect.id, effect })
              }
            />
          ))}

          {totalCount === 0 && (
            <p className="text-xs text-muted-foreground">No effects active</p>
          )}

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setSheetState({ mode: 'add' })}
          >
            <Plus className="size-4 mr-1" /> Add Effect
          </Button>
        </div>
      )}

      <AddEditGroupFxSheet
        group={group}
        mode={sheetState.mode === 'closed' ? undefined : sheetState}
        onClose={() => setSheetState({ mode: 'closed' })}
      />
    </div>
  )
}

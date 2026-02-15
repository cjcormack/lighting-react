import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Pause, Play, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getBeatDivisionLabel, getDistributionLabel, getElementModeLabel } from '../../fixtures/fx/fxConstants'
import {
  usePauseGroupFxMutation,
  useResumeGroupFxMutation,
  useRemoveGroupFxMutation,
} from '@/store/groups'
import type { GroupActiveEffect } from '@/api/groupsApi'

interface GroupActiveEffectItemProps {
  effect: GroupActiveEffect
  groupName: string
  onEdit: () => void
}

export function GroupActiveEffectItem({ effect, groupName, onEdit }: GroupActiveEffectItemProps) {
  const [pauseFx] = usePauseGroupFxMutation()
  const [resumeFx] = useResumeGroupFxMutation()
  const [removeFx] = useRemoveGroupFxMutation()

  const speedLabel = getBeatDivisionLabel(effect.beatDivision)

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-2 rounded border text-sm',
        !effect.isRunning && 'opacity-50',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium truncate">{effect.effectType}</span>
          {effect.elementMode && (
            <Badge variant="outline" className="text-[10px] leading-tight px-1 py-0 shrink-0">
              {getElementModeLabel(effect.elementMode)}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
          <span>{effect.propertyName}</span>
          <span className="text-muted-foreground/50">&middot;</span>
          <span>{speedLabel}</span>
          {effect.blendMode !== 'OVERRIDE' && (
            <>
              <span className="text-muted-foreground/50">&middot;</span>
              <span className="lowercase">{effect.blendMode}</span>
            </>
          )}
          <span className="text-muted-foreground/50">&middot;</span>
          <span>{getDistributionLabel(effect.distribution)}</span>
        </div>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() =>
            effect.isRunning
              ? pauseFx({ id: effect.id, groupName })
              : resumeFx({ id: effect.id, groupName })
          }
        >
          {effect.isRunning ? (
            <Pause className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
        </Button>
        <Button variant="ghost" size="icon" className="size-7" onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-destructive hover:text-destructive"
          onClick={() => removeFx({ id: effect.id, groupName })}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

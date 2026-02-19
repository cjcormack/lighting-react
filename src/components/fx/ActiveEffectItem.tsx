import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Pause, Play, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getBeatDivisionLabel, getDistributionLabel } from './fxConstants'

interface ActiveEffectItemProps {
  effectType: string
  propertyName: string
  beatDivision: number
  blendMode: string
  isRunning: boolean
  distributionStrategy?: string
  stepTiming?: boolean
  /** Optional badge to show next to the effect name (e.g. "via GroupName" or element mode) */
  badge?: string
  /** Called when pause/resume is clicked. Omit to hide all action buttons. */
  onPauseResume?: () => void
  onEdit?: () => void
  onRemove?: () => void
}

export function ActiveEffectItem({
  effectType,
  propertyName,
  beatDivision,
  blendMode,
  isRunning,
  distributionStrategy,
  stepTiming,
  badge,
  onPauseResume,
  onEdit,
  onRemove,
}: ActiveEffectItemProps) {
  const speedLabel = getBeatDivisionLabel(beatDivision)
  const showActions = onPauseResume || onEdit || onRemove

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-2 rounded border text-sm',
        !isRunning && 'opacity-50',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium truncate">{effectType}</span>
          {badge && (
            <Badge variant="outline" className="text-[10px] leading-tight px-1 py-0 shrink-0">
              {badge}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
          <span>{propertyName}</span>
          <span className="text-muted-foreground/50">&middot;</span>
          <span>{speedLabel}</span>
          {blendMode !== 'OVERRIDE' && (
            <>
              <span className="text-muted-foreground/50">&middot;</span>
              <span className="lowercase">{blendMode}</span>
            </>
          )}
          {distributionStrategy && distributionStrategy !== 'UNIFIED' && (
            <>
              <span className="text-muted-foreground/50">&middot;</span>
              <span>{getDistributionLabel(distributionStrategy)}</span>
            </>
          )}
          {stepTiming && (
            <>
              <span className="text-muted-foreground/50">&middot;</span>
              <span>step</span>
            </>
          )}
        </div>
      </div>

      {showActions && (
        <div className="flex items-center gap-0.5 shrink-0">
          {onPauseResume && (
            <Button variant="ghost" size="icon" className="size-7" onClick={onPauseResume}>
              {isRunning ? (
                <Pause className="size-3.5" />
              ) : (
                <Play className="size-3.5" />
              )}
            </Button>
          )}
          {onEdit && (
            <Button variant="ghost" size="icon" className="size-7" onClick={onEdit}>
              <Pencil className="size-3.5" />
            </Button>
          )}
          {onRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-destructive hover:text-destructive"
              onClick={onRemove}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

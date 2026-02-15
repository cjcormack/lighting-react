import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Pause, Play, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getBeatDivisionLabel, getDistributionLabel } from './fxConstants'
import {
  useRemoveFxMutation,
  usePauseFxMutation,
  useResumeFxMutation,
  type FixtureDirectEffect,
  type FixtureIndirectEffect,
} from '@/store/fixtureFx'

interface ActiveEffectItemProps {
  effect: FixtureDirectEffect | FixtureIndirectEffect
  kind: 'direct' | 'indirect'
  fixtureKey: string
  onEdit?: () => void
}

export function ActiveEffectItem({ effect, kind, fixtureKey, onEdit }: ActiveEffectItemProps) {
  const [removeFx] = useRemoveFxMutation()
  const [pauseFx] = usePauseFxMutation()
  const [resumeFx] = useResumeFxMutation()

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
          {kind === 'indirect' && 'groupName' in effect && (
            <Badge variant="outline" className="text-[10px] leading-tight px-1 py-0 shrink-0">
              via {effect.groupName}
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
          {effect.distributionStrategy && effect.distributionStrategy !== 'UNIFIED' && (
            <>
              <span className="text-muted-foreground/50">&middot;</span>
              <span>{getDistributionLabel(effect.distributionStrategy)}</span>
            </>
          )}
        </div>
      </div>

      {kind === 'direct' && (
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() =>
              effect.isRunning
                ? pauseFx({ id: effect.id, fixtureKey })
                : resumeFx({ id: effect.id, fixtureKey })
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
            onClick={() => removeFx({ id: effect.id, fixtureKey })}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}

import { AudioWaveform, Layers, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { useGroupActiveEffectsQuery } from '@/store/groups'
import { useFixtureEffectsQuery } from '@/store/fixtureFx'
import type { BuskingTarget } from './buskingTypes'

interface TargetListItemProps {
  target: BuskingTarget
  isSelected: boolean
  onSelect: () => void
  onToggle: () => void
}

function GroupFxCount({ groupName }: { groupName: string }) {
  const { data: effects } = useGroupActiveEffectsQuery(groupName)
  const count = effects?.length ?? 0
  const running = effects?.filter((e) => e.isRunning).length ?? 0
  if (count === 0) return null
  return (
    <div className="flex items-center gap-1">
      <AudioWaveform className={cn('size-3', running > 0 ? 'text-primary' : 'text-muted-foreground/50')} />
      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
    </div>
  )
}

function FixtureFxCount({ fixtureKey }: { fixtureKey: string }) {
  const { data: effects } = useFixtureEffectsQuery(fixtureKey)
  const all = [...(effects?.direct ?? []), ...(effects?.indirect ?? [])]
  const count = all.length
  const running = all.filter((e) => e.isRunning).length
  if (count === 0) return null
  return (
    <div className="flex items-center gap-1">
      <AudioWaveform className={cn('size-3', running > 0 ? 'text-primary' : 'text-muted-foreground/50')} />
      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
    </div>
  )
}

export function TargetListItem({ target, isSelected, onSelect, onToggle }: TargetListItemProps) {
  const isGroup = target.type === 'group'

  return (
    <button
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault()
        onToggle()
      }}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors',
        'hover:bg-accent/50 active:bg-accent',
        'min-h-[44px]',
        isSelected && 'bg-accent ring-1 ring-primary/30',
      )}
    >
      {isGroup ? (
        <Layers className="size-4 text-muted-foreground shrink-0" />
      ) : (
        <LayoutGrid className="size-4 text-muted-foreground shrink-0" />
      )}

      <span className="truncate flex-1 text-left">
        {isGroup ? target.name : target.fixture.name}
      </span>

      {isGroup && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
          {target.group.memberCount}
        </Badge>
      )}

      {isGroup ? (
        <GroupFxCount groupName={target.name} />
      ) : (
        <FixtureFxCount fixtureKey={target.key} />
      )}
    </button>
  )
}

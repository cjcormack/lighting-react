import { Badge } from '@/components/ui/badge'
import { AudioWaveform } from 'lucide-react'
import { useGroupActiveEffectsQuery } from '@/store/groups'

interface GroupFxBadgeProps {
  groupName: string
}

export function GroupFxBadge({ groupName }: GroupFxBadgeProps) {
  const { data: effects } = useGroupActiveEffectsQuery(groupName)

  if (!effects || effects.length === 0) return null

  const anyRunning = effects.some((e) => e.isRunning)

  return (
    <Badge variant={anyRunning ? 'default' : 'secondary'} className="text-xs gap-1">
      <AudioWaveform className="size-3" />
      {effects.length} FX
    </Badge>
  )
}

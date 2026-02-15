import { Badge } from '@/components/ui/badge'
import { AudioWaveform } from 'lucide-react'
import { useFixtureEffectsQuery } from '@/store/fixtureFx'

interface FixtureFxBadgeProps {
  fixtureKey: string
}

export function FixtureFxBadge({ fixtureKey }: FixtureFxBadgeProps) {
  const { data: effects } = useFixtureEffectsQuery(fixtureKey)

  const totalCount = (effects?.direct.length ?? 0) + (effects?.indirect.length ?? 0)
  if (totalCount === 0) return null

  return (
    <Badge variant="default" className="text-xs gap-1">
      <AudioWaveform className="size-3" />
      {totalCount} FX
    </Badge>
  )
}

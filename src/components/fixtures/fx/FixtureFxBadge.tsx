import { Badge } from '@/components/ui/badge'
import { AudioWaveform } from 'lucide-react'
import { useFixtureEffectsQuery } from '@/store/fixtureFx'

interface FixtureFxBadgeProps {
  fixtureKey: string
}

export function FixtureFxBadge({ fixtureKey }: FixtureFxBadgeProps) {
  const { data: effects } = useFixtureEffectsQuery(fixtureKey)

  const allEffects = [...(effects?.direct ?? []), ...(effects?.indirect ?? [])]
  if (allEffects.length === 0) return null

  const anyRunning = allEffects.some((e) => e.isRunning)

  return (
    <Badge variant={anyRunning ? 'default' : 'secondary'} className="text-xs gap-1">
      <AudioWaveform className="size-3" />
      {allEffects.length} FX
    </Badge>
  )
}

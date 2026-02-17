import { Badge } from '@/components/ui/badge'
import { AudioWaveform } from 'lucide-react'
import { useFixtureEffectsQuery } from '@/store/fixtureFx'
import { useGroupActiveEffectsQuery } from '@/store/groups'

type FxBadgeProps =
  | { fixtureKey: string; groupName?: never }
  | { groupName: string; fixtureKey?: never }

export function FxBadge(props: FxBadgeProps) {
  if ('fixtureKey' in props && props.fixtureKey) {
    return <FixtureFxBadge fixtureKey={props.fixtureKey} />
  }
  if ('groupName' in props && props.groupName) {
    return <GroupFxBadge groupName={props.groupName} />
  }
  return null
}

function FixtureFxBadge({ fixtureKey }: { fixtureKey: string }) {
  const { data: effects } = useFixtureEffectsQuery(fixtureKey)

  const allEffects = [...(effects?.direct ?? []), ...(effects?.indirect ?? [])]
  if (allEffects.length === 0) return null

  const anyRunning = allEffects.some((e) => e.isRunning)

  return <FxBadgeDisplay count={allEffects.length} anyRunning={anyRunning} />
}

function GroupFxBadge({ groupName }: { groupName: string }) {
  const { data: effects } = useGroupActiveEffectsQuery(groupName)

  if (!effects || effects.length === 0) return null

  const anyRunning = effects.some((e) => e.isRunning)

  return <FxBadgeDisplay count={effects.length} anyRunning={anyRunning} />
}

function FxBadgeDisplay({ count, anyRunning }: { count: number; anyRunning: boolean }) {
  return (
    <Badge variant={anyRunning ? 'default' : 'secondary'} className="text-xs gap-1">
      <AudioWaveform className="size-3" />
      {count} FX
    </Badge>
  )
}

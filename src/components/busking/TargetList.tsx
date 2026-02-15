import { useGroupListQuery } from '@/store/groups'
import { useFixtureListQuery } from '@/store/fixtures'
import { TargetListItem } from './TargetListItem'
import type { BuskingTarget } from './buskingTypes'
import { targetKey } from './buskingTypes'

interface TargetListProps {
  selectedTargets: Map<string, BuskingTarget>
  onSelect: (target: BuskingTarget) => void
  onToggle: (target: BuskingTarget) => void
}

export function TargetList({ selectedTargets, onSelect, onToggle }: TargetListProps) {
  const { data: groups } = useGroupListQuery()
  const { data: fixtures } = useFixtureListQuery()

  const groupTargets: BuskingTarget[] =
    groups?.map((g) => ({ type: 'group' as const, name: g.name, group: g })) ?? []

  const fixtureTargets: BuskingTarget[] =
    fixtures?.map((f) => ({ type: 'fixture' as const, key: f.key, fixture: f })) ?? []

  return (
    <div className="flex flex-col gap-1 p-2">
      {groupTargets.length > 0 && (
        <>
          <div className="px-3 pt-1 pb-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Groups
          </div>
          {groupTargets.map((target) => (
            <TargetListItem
              key={targetKey(target)}
              target={target}
              isSelected={selectedTargets.has(targetKey(target))}
              onSelect={() => onSelect(target)}
              onToggle={() => onToggle(target)}
            />
          ))}
        </>
      )}

      {fixtureTargets.length > 0 && (
        <>
          <div className="px-3 pt-3 pb-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Fixtures
          </div>
          {fixtureTargets.map((target) => (
            <TargetListItem
              key={targetKey(target)}
              target={target}
              isSelected={selectedTargets.has(targetKey(target))}
              onSelect={() => onSelect(target)}
              onToggle={() => onToggle(target)}
            />
          ))}
        </>
      )}

      {groupTargets.length === 0 && fixtureTargets.length === 0 && (
        <div className="px-3 py-8 text-center text-sm text-muted-foreground">
          No fixtures or groups configured
        </div>
      )}
    </div>
  )
}

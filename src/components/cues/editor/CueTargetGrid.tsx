import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Users, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFixtureListQuery } from '@/store/fixtures'
import { useGroupListQuery } from '@/store/groups'
import { CompactFixtureCard } from '@/components/groups/CompactFixtureCard'
import type { Cue } from '@/api/cuesApi'

export type TargetSelection =
  | { type: 'group'; key: string }
  | { type: 'fixture'; key: string }

export interface CueTargetGridProps {
  cue: Cue | null
  tab: 'groups' | 'fixtures'
  onTabChange: (tab: 'groups' | 'fixtures') => void
  selection: TargetSelection | null
  onSelectionChange: (sel: TargetSelection | null) => void
}

/**
 * Segmented Groups|Fixtures grid. Cards with any existing assignment, preset, or effect
 * in the cue get an "in cue" badge; cards without stay openable.
 */
export function CueTargetGrid({
  cue,
  tab,
  onTabChange,
  selection,
  onSelectionChange,
}: CueTargetGridProps) {
  const { data: groups, isLoading: groupsLoading } = useGroupListQuery()
  const { data: fixtures, isLoading: fixturesLoading } = useFixtureListQuery()

  const assignedKeys = useMemo(() => {
    const groupKeys = new Set<string>()
    const fixtureKeys = new Set<string>()
    if (!cue) return { groupKeys, fixtureKeys }
    for (const row of cue.propertyAssignments ?? []) {
      if (row.targetType === 'group') groupKeys.add(row.targetKey)
      else fixtureKeys.add(row.targetKey)
    }
    for (const app of cue.presetApplications) {
      for (const t of app.targets) {
        if (t.type === 'group') groupKeys.add(t.key)
        else fixtureKeys.add(t.key)
      }
    }
    for (const eff of cue.adHocEffects) {
      if (eff.targetType === 'group') groupKeys.add(eff.targetKey)
      else fixtureKeys.add(eff.targetKey)
    }
    return { groupKeys, fixtureKeys }
  }, [cue])

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-md border p-0.5 bg-muted/30">
        <Button
          type="button"
          variant={tab === 'groups' ? 'default' : 'ghost'}
          size="sm"
          className="h-7 gap-1.5"
          onClick={() => onTabChange('groups')}
        >
          <Users className="size-3.5" />
          Groups
          {groups && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
              {groups.length}
            </Badge>
          )}
        </Button>
        <Button
          type="button"
          variant={tab === 'fixtures' ? 'default' : 'ghost'}
          size="sm"
          className="h-7 gap-1.5"
          onClick={() => onTabChange('fixtures')}
        >
          <Lightbulb className="size-3.5" />
          Fixtures
          {fixtures && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
              {fixtures.length}
            </Badge>
          )}
        </Button>
      </div>

      {tab === 'groups' ? (
        groupsLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : !groups || groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No groups defined.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => {
              const isSelected =
                selection?.type === 'group' && selection.key === group.name
              const isAssigned = assignedKeys.groupKeys.has(group.name)
              return (
                <button
                  key={group.name}
                  type="button"
                  onClick={() =>
                    onSelectionChange({ type: 'group', key: group.name })
                  }
                  className={cn(
                    'px-3 py-2 border rounded text-left min-w-[140px] max-w-[220px] transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'hover:bg-accent/50',
                    isAssigned && !isSelected && 'ring-1 ring-primary/40',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{group.name}</span>
                    {isAssigned && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0">
                        in cue
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {group.memberCount} fixture{group.memberCount !== 1 ? 's' : ''}
                  </p>
                </button>
              )
            })}
          </div>
        )
      ) : fixturesLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : !fixtures || fixtures.length === 0 ? (
        <p className="text-sm text-muted-foreground">No fixtures defined.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {fixtures.map((fixture) => {
            const isSelected =
              selection?.type === 'fixture' && selection.key === fixture.key
            const isAssigned = assignedKeys.fixtureKeys.has(fixture.key)
            return (
              <div
                key={fixture.key}
                className={cn(
                  'relative',
                  isSelected && 'ring-2 ring-primary rounded',
                  isAssigned && !isSelected && 'ring-1 ring-primary/40 rounded',
                )}
              >
                <CompactFixtureCard
                  fixture={fixture}
                  fixtureKey={fixture.key}
                  fixtureName={fixture.name}
                  tags={fixture.groups}
                  onClick={() =>
                    onSelectionChange({ type: 'fixture', key: fixture.key })
                  }
                />
                {isAssigned && (
                  <Badge
                    variant="secondary"
                    className="absolute top-1 right-1 text-[9px] px-1 py-0"
                  >
                    in cue
                  </Badge>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

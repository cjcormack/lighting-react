import { useMemo } from 'react'
import { X, Layers, AudioWaveform, ChevronDown } from 'lucide-react'
import { CompactFixtureCard, MultiElementCompactCard } from '@/components/groups/CompactFixtureCard'
import { Badge } from '@/components/ui/badge'
import { useGroupActiveEffectsQuery } from '@/store/groups'
import { useFixtureListQuery, type Fixture } from '@/store/fixtures'
import { cn } from '@/lib/utils'
import type { BuskingTarget } from './buskingTypes'

interface SelectedTargetSummaryProps {
  targets: BuskingTarget[]
  onDeselect?: (target: BuskingTarget) => void
  /** Set of group names whose member fixtures are expanded */
  expandedGroups: Set<string>
  /** Toggle a group's expanded state */
  onToggleGroupExpanded: (groupName: string) => void
  /** Open fixture detail modal */
  onFixtureClick?: (fixtureKey: string) => void
}

export function SelectedTargetSummary({
  targets,
  onDeselect,
  expandedGroups,
  onToggleGroupExpanded,
  onFixtureClick,
}: SelectedTargetSummaryProps) {
  if (targets.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5">
      {targets.map((target) =>
        target.type === 'fixture' ? (
          <FixtureTargetCard
            key={`f:${target.key}`}
            target={target}
            onDeselect={onDeselect}
            onFixtureClick={onFixtureClick}
          />
        ) : (
          <GroupTargetSection
            key={`g:${target.name}`}
            target={target}
            onDeselect={onDeselect}
            expanded={expandedGroups.has(target.name)}
            onToggleExpanded={() => onToggleGroupExpanded(target.name)}
            onFixtureClick={onFixtureClick}
          />
        )
      )}
    </div>
  )
}

function FixtureTargetCard({
  target,
  onDeselect,
  onFixtureClick,
}: {
  target: Extract<BuskingTarget, { type: 'fixture' }>
  onDeselect?: (target: BuskingTarget) => void
  onFixtureClick?: (fixtureKey: string) => void
}) {
  return (
    <div className="relative group inline-flex">
      <CompactFixtureCard
        fixtureKey={target.key}
        fixtureName={target.fixture.name}
        tags={[]}
        onClick={() => onFixtureClick?.(target.key)}
      />
      {onDeselect && (
        <button
          className="absolute -top-1 -right-1 size-4 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
          onClick={(e) => {
            e.stopPropagation()
            onDeselect(target)
          }}
        >
          <X className="size-2.5" />
        </button>
      )}
    </div>
  )
}

/** Group card with collapsible member fixture cards inside the box */
function GroupTargetSection({
  target,
  onDeselect,
  expanded,
  onToggleExpanded,
  onFixtureClick,
}: {
  target: Extract<BuskingTarget, { type: 'group' }>
  onDeselect?: (target: BuskingTarget) => void
  expanded: boolean
  onToggleExpanded: () => void
  onFixtureClick?: (fixtureKey: string) => void
}) {
  const { data: effects } = useGroupActiveEffectsQuery(target.name)
  const fxCount = effects?.length ?? 0
  const running = effects?.filter((e) => e.isRunning).length ?? 0

  return (
    <div className="relative group">
      <div className="border rounded overflow-hidden">
        {/* Header row */}
        <button
          onClick={onToggleExpanded}
          className="flex w-full items-center gap-1.5 p-2 text-left hover:bg-accent/50 transition-colors"
        >
          <ChevronDown
            className={cn(
              'size-3.5 text-muted-foreground shrink-0 transition-transform duration-200',
              !expanded && '-rotate-90',
            )}
          />
          <Layers className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate flex-1">{target.name}</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
            {target.group.memberCount}
          </Badge>
          {fxCount > 0 && (
            <AudioWaveform className={cn('size-3 shrink-0', running > 0 ? 'text-primary' : 'text-muted-foreground/50')} />
          )}
        </button>

        {/* Member fixture cards inside the box */}
        {expanded && (
          <GroupMemberCards groupName={target.name} onFixtureClick={onFixtureClick} />
        )}
      </div>
      {onDeselect && (
        <button
          className="absolute -top-1 -right-1 size-4 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
          onClick={(e) => {
            e.stopPropagation()
            onDeselect(target)
          }}
        >
          <X className="size-2.5" />
        </button>
      )}
    </div>
  )
}

/** Renders compact fixture cards for all members of a group */
function GroupMemberCards({
  groupName,
  onFixtureClick,
}: {
  groupName: string
  onFixtureClick?: (fixtureKey: string) => void
}) {
  const { data: fixtureList } = useFixtureListQuery()

  const { regularFixtures, multiElementFixtures } = useMemo(() => {
    if (!fixtureList) return { regularFixtures: [], multiElementFixtures: new Map<string, Fixture>() }

    const members = fixtureList.filter((f) => f.groups.includes(groupName))
    const regular: Fixture[] = []
    const multiElement = new Map<string, Fixture>()

    for (const member of members) {
      if (member.elements && member.elements.length > 1) {
        multiElement.set(member.key, member)
      } else {
        regular.push(member)
      }
    }

    return { regularFixtures: regular, multiElementFixtures: multiElement }
  }, [fixtureList, groupName])

  return (
    <div className="flex flex-wrap items-stretch gap-1.5 px-2 pb-2">
      {regularFixtures.map((fixture) => (
        <CompactFixtureCard
          key={fixture.key}
          fixtureKey={fixture.key}
          fixtureName={fixture.name}
          tags={[]}
          onClick={() => onFixtureClick?.(fixture.key)}
        />
      ))}
      {Array.from(multiElementFixtures.entries()).map(([parentKey, fixture]) => (
        <MultiElementCompactCard
          key={parentKey}
          parentKey={parentKey}
          elementCount={fixture.elements?.length ?? 0}
          onClick={() => onFixtureClick?.(parentKey)}
        />
      ))}
    </div>
  )
}

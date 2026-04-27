import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useViewedProject } from '../ProjectSwitcher'
import { usePatchListQuery, usePatchGroupListQuery } from '../store/patches'
import {
  useFixtureListQuery,
  useFixtureTypeListQuery,
  type Fixture,
  type FixtureTypeInfo,
} from '../store/fixtures'
import { StageMarker } from './stage/StageMarker'
import { StageBackdrop } from './stage/StageBackdrop'
import { chipButtonClassName } from './patches/chipButton'

const STAGE_CANVAS_HEIGHT = 'h-[420px]'

interface StageOverviewPanelProps {
  isVisible: boolean
  selectedFixtureKey: string | null
  onFixtureClick: (fixtureKey: string) => void
}

export function StageOverviewPanel({
  isVisible,
  selectedFixtureKey,
  onFixtureClick,
}: StageOverviewPanelProps) {
  const project = useViewedProject()
  const projectId = project?.id

  const { data: patches, isLoading: patchesLoading } = usePatchListQuery(projectId!, {
    skip: projectId == null,
  })
  const { data: fixtures } = useFixtureListQuery()
  const { data: fixtureTypes } = useFixtureTypeListQuery()
  const { data: groups } = usePatchGroupListQuery(projectId!, {
    skip: projectId == null,
  })

  const [groupFilter, setGroupFilter] = useState<number | null>(null)

  const placedPatches = useMemo(
    () => (patches ?? []).filter((p) => p.stageX != null && p.stageY != null),
    [patches],
  )

  const fixtureByKey = useMemo(() => {
    const map = new Map<string, Fixture>()
    fixtures?.forEach((f) => map.set(f.key, f))
    return map
  }, [fixtures])

  const typeByKey = useMemo(() => {
    const map = new Map<string, FixtureTypeInfo>()
    fixtureTypes?.forEach((t) => map.set(t.typeKey, t))
    return map
  }, [fixtureTypes])

  const visibleGroups = (groups ?? []).filter((g) => g.memberCount > 0)
  const showChips = visibleGroups.length > 0

  return (
    <div
      className={cn(
        'grid transition-all duration-200 ease-in-out',
        isVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
    >
      <div className="overflow-hidden">
        <div className="border-b bg-background">
          <div className="flex items-center gap-2 px-4 py-2 border-b">
            <span
              className="size-2 rounded-full bg-primary"
              style={{ boxShadow: '0 0 8px currentColor' }}
            />
            <span className="text-sm font-semibold">Stage</span>
            <span className="text-xs font-mono text-muted-foreground border-l pl-2">
              {placedPatches.length} fixture{placedPatches.length === 1 ? '' : 's'}
            </span>
            <div className="flex-1" />
            {groupFilter != null && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setGroupFilter(null)}
                title="Reset filter"
              >
                <RotateCcw className="size-3.5" />
                Reset
              </Button>
            )}
          </div>

          {showChips && (
            <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b">
              <ChipButton
                active={groupFilter == null}
                onClick={() => setGroupFilter(null)}
              >
                All <span className="ml-1 font-mono text-[10px] opacity-70">{placedPatches.length}</span>
              </ChipButton>
              {visibleGroups.map((g) => (
                <ChipButton
                  key={g.id}
                  active={groupFilter === g.id}
                  onClick={() => setGroupFilter(groupFilter === g.id ? null : g.id)}
                >
                  {g.name}
                  <span className="ml-1 font-mono text-[10px] opacity-70">{g.memberCount}</span>
                </ChipButton>
              ))}
            </div>
          )}

          <div className="p-4">
            {patchesLoading ? (
              <div className={cn('flex items-center justify-center', STAGE_CANVAS_HEIGHT)}>
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : placedPatches.length === 0 ? (
              <EmptyState projectId={projectId} />
            ) : (
              <StageBackdrop className={STAGE_CANVAS_HEIGHT}>
                {placedPatches.map((patch) => {
                  const fixture = fixtureByKey.get(patch.key)
                  const fixtureType = fixture
                    ? typeByKey.get(fixture.typeKey)
                    : undefined
                  const matchesFilter =
                    groupFilter == null ||
                    patch.groups.some((g) => g.id === groupFilter)
                  return (
                    <button
                      key={patch.id}
                      type="button"
                      onClick={() => onFixtureClick(patch.key)}
                      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer focus:outline-none"
                      style={{
                        left: `${patch.stageX}%`,
                        top: `${patch.stageY}%`,
                      }}
                    >
                      <StageMarker
                        patch={patch}
                        fixture={fixture}
                        fixtureType={fixtureType}
                        selected={selectedFixtureKey === patch.key}
                        dimmed={!matchesFilter}
                      />
                    </button>
                  )
                })}
              </StageBackdrop>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs',
        chipButtonClassName(active),
      )}
    >
      {children}
    </button>
  )
}

function EmptyState({ projectId }: { projectId: number | undefined }) {
  const navigate = useNavigate()
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 text-center', STAGE_CANVAS_HEIGHT)}>
      <p className="text-sm text-muted-foreground max-w-md">
        No fixtures placed yet. Open a patch and drag the dot on the stage map to place it.
      </p>
      {projectId != null && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/projects/${projectId}/patches`)}
        >
          Open patches
        </Button>
      )}
    </div>
  )
}

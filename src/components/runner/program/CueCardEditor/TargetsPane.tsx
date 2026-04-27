import { useState, useCallback } from 'react'
import {
  ChevronRight,
  Layers,
  Lightbulb,
  Plus,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useFixtureListQuery } from '@/store/fixtures'
import { useGroupListQuery, useGroupQuery } from '@/store/groups'
import { usePatchProjectCueMutation } from '@/store/cues'
import { buildCueInput } from '@/lib/cueUtils'
import { MiniStage } from './MiniStage'
import { AddTargetSheet } from './AddTargetSheet'
import type { Cue, CueTarget } from '@/api/cuesApi'
import { targetEquals } from './targetUtils'

interface TargetsPaneProps {
  cue: Cue
  projectId: number
  targets: CueTarget[]
}

/**
 * Mixed list of groups + fixtures. Groups are expandable to show member
 * fixtures (each member can be promoted to an "override" target — a fixture
 * target inside a group target).
 *
 * Adding a target is a UI-only construct: it inserts an empty placeholder
 * `propertyAssignment` so the target shows in the union — first real edit
 * replaces it. Removing a target purges every assignment / effect / preset
 * targeted at that key.
 */
export function TargetsPane({ cue, projectId, targets }: TargetsPaneProps) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [patchCue] = usePatchProjectCueMutation()

  const groupTargets = targets.filter((t) => t.type === 'group')
  const fixtureTargets = targets.filter((t) => t.type === 'fixture')

  const removeTarget = useCallback(
    (target: CueTarget) => {
      const input = buildCueInput(cue)
      input.propertyAssignments = (input.propertyAssignments ?? []).filter(
        (a) => !(a.targetType === target.type && a.targetKey === target.key),
      )
      input.adHocEffects = input.adHocEffects.filter(
        (e) => !(e.targetType === target.type && e.targetKey === target.key),
      )
      input.presetApplications = input.presetApplications
        .map((pa) => ({
          ...pa,
          targets: pa.targets.filter((t) => !targetEquals(t, target)),
        }))
        .filter((pa) => pa.targets.length > 0)
      patchCue({
        projectId,
        cueId: cue.id,
        propertyAssignments: input.propertyAssignments,
        adHocEffects: input.adHocEffects,
        presetApplications: input.presetApplications,
      })
    },
    [cue, projectId, patchCue],
  )

  const addFixtureOverride = useCallback(
    (fixtureKey: string) => {
      // Use a placeholder dimmer assignment as the "I exist" marker.
      const input = buildCueInput(cue)
      const existing = (input.propertyAssignments ?? []).some(
        (a) => a.targetType === 'fixture' && a.targetKey === fixtureKey,
      )
      if (existing) return
      patchCue({
        projectId,
        cueId: cue.id,
        propertyAssignments: [
          ...(input.propertyAssignments ?? []),
          {
            targetType: 'fixture',
            targetKey: fixtureKey,
            propertyName: 'dimmer',
            value: '0',
          },
        ],
      })
    },
    [cue, projectId, patchCue],
  )

  return (
    <div className="space-y-2">
      <MiniStage projectId={projectId} targets={targets} />

      <div className="space-y-1">
        {groupTargets.map((t) => (
          <GroupRow
            key={`group:${t.key}`}
            groupName={t.key}
            isOpen={openGroups.has(t.key)}
            onToggle={() => {
              setOpenGroups((s) => {
                const n = new Set(s)
                n.has(t.key) ? n.delete(t.key) : n.add(t.key)
                return n
              })
            }}
            onRemove={() => removeTarget(t)}
            existingFixtureTargetKeys={new Set(fixtureTargets.map((f) => f.key))}
            onAddFixtureOverride={addFixtureOverride}
            onRemoveFixture={(fk) => removeTarget({ type: 'fixture', key: fk })}
          />
        ))}

        <OrphanFixtureRows
          fixtureTargets={fixtureTargets}
          groupTargetNames={new Set(groupTargets.map((g) => g.key))}
          onRemove={removeTarget}
        />

        {targets.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No targets. Add a group or fixture to give this cue something to do.
          </p>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full h-8 border-dashed text-xs gap-1"
        onClick={() => setAddOpen(true)}
      >
        <Plus className="size-3.5" />
        Add target
      </Button>

      <AddTargetSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        cue={cue}
        projectId={projectId}
      />
    </div>
  )
}

// ─── Sub-rows ──────────────────────────────────────────────────────────────

function GroupRow({
  groupName,
  isOpen,
  onToggle,
  onRemove,
  existingFixtureTargetKeys,
  onAddFixtureOverride,
  onRemoveFixture,
}: {
  groupName: string
  isOpen: boolean
  onToggle: () => void
  onRemove: () => void
  existingFixtureTargetKeys: Set<string>
  onAddFixtureOverride: (fixtureKey: string) => void
  onRemoveFixture: (fixtureKey: string) => void
}) {
  const { data: groups } = useGroupListQuery()
  const group = groups?.find((g) => g.name === groupName)
  const memberCount = group?.memberCount ?? 0

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded border bg-card hover:bg-muted/40 text-sm transition-colors"
      >
        <ChevronRight
          className={cn(
            'size-3.5 text-muted-foreground transition-transform',
            isOpen && 'rotate-90',
            memberCount === 0 && 'invisible',
          )}
        />
        <Layers className="size-3.5 text-blue-400 shrink-0" />
        <span className="flex-1 text-left truncate font-medium">{groupName}</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
          {memberCount}
        </Badge>
        <span
          role="button"
          tabIndex={0}
          aria-label="Remove target"
          className="size-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              onRemove()
            }
          }}
        >
          <X className="size-3.5" />
        </span>
      </button>
      {isOpen && (
        <GroupMembersDrilldown
          groupName={groupName}
          existingFixtureTargetKeys={existingFixtureTargetKeys}
          onAddFixtureOverride={onAddFixtureOverride}
          onRemoveFixture={onRemoveFixture}
        />
      )}
    </>
  )
}

function GroupMembersDrilldown({
  groupName,
  existingFixtureTargetKeys,
  onAddFixtureOverride,
  onRemoveFixture,
}: {
  groupName: string
  existingFixtureTargetKeys: Set<string>
  onAddFixtureOverride: (fixtureKey: string) => void
  onRemoveFixture: (fixtureKey: string) => void
}) {
  const { data: detail } = useGroupQuery(groupName, { skip: !groupName })

  if (!detail) return null
  if (detail.members.length === 0) return null

  return (
    <div className="ml-6 border-l pl-2 space-y-1 py-1">
      {detail.members.map((m) => {
        const overridden = existingFixtureTargetKeys.has(m.fixtureKey)
        return (
          <div
            key={m.fixtureKey}
            className="flex items-center gap-2 px-2 py-1 rounded text-xs"
          >
            <Lightbulb
              className={cn(
                'size-3 shrink-0',
                overridden ? 'text-amber-500' : 'text-muted-foreground/60',
              )}
            />
            <span
              className={cn(
                'flex-1 truncate',
                overridden ? 'text-amber-500 font-medium' : 'text-muted-foreground',
              )}
            >
              {m.fixtureName}
              {overridden && <span className="ml-1 text-[10px]">(override)</span>}
            </span>
            <button
              type="button"
              className="size-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent"
              onClick={() => {
                if (overridden) onRemoveFixture(m.fixtureKey)
                else onAddFixtureOverride(m.fixtureKey)
              }}
              title={
                overridden
                  ? 'Remove fixture override'
                  : 'Add fixture override (target this fixture individually)'
              }
            >
              {overridden ? <X className="size-3" /> : <Plus className="size-3" />}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function FixtureRow({
  fixtureKey,
  onRemove,
  orphan,
}: {
  fixtureKey: string
  onRemove: () => void
  orphan?: boolean
}) {
  const { data: fixtures } = useFixtureListQuery()
  const fixture = fixtures?.find((f) => f.key === fixtureKey)
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded border bg-card text-sm">
      <span className="size-3.5" />
      <Lightbulb className="size-3.5 text-amber-500 shrink-0" />
      <span className="flex-1 truncate font-medium">
        {fixture?.name ?? fixtureKey}
      </span>
      {orphan && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
          fixture
        </Badge>
      )}
      <button
        type="button"
        className="size-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        onClick={onRemove}
        aria-label="Remove target"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

function OrphanFixtureRows({
  fixtureTargets,
  groupTargetNames,
  onRemove,
}: {
  fixtureTargets: CueTarget[]
  groupTargetNames: Set<string>
  onRemove: (t: CueTarget) => void
}) {
  const { data: fixtures } = useFixtureListQuery()
  return (
    <>
      {fixtureTargets
        .filter((ft) => {
          // Hide fixtures that belong to one of the group targets — those
          // already show via drilldown as overrides.
          const fixture = fixtures?.find((f) => f.key === ft.key)
          if (!fixture) return true
          return !fixture.groups.some((g) => groupTargetNames.has(g))
        })
        .map((t) => (
          <FixtureRow
            key={`fix:${t.key}`}
            fixtureKey={t.key}
            onRemove={() => onRemove(t)}
            orphan
          />
        ))}
    </>
  )
}

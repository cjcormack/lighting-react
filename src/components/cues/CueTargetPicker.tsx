import { useGroupListQuery } from '@/store/groups'
import { useFixtureListQuery } from '@/store/fixtures'
import { Badge } from '@/components/ui/badge'
import { Layers, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CueTarget } from '@/api/cuesApi'

interface CueTargetPickerProps {
  selectedTargets: CueTarget[]
  onChange: (targets: CueTarget[]) => void
  /** Keys that should be greyed out (e.g. no compatible presets / no compatible effects).
   *  Map from "group:<name>" or "fixture:<key>" → reason string. */
  disabledKeys?: Map<string, string>
}

function isSelected(targets: CueTarget[], type: CueTarget['type'], key: string): boolean {
  return targets.some((t) => t.type === type && t.key === key)
}

function toggleTarget(
  targets: CueTarget[],
  type: CueTarget['type'],
  key: string,
): CueTarget[] {
  if (isSelected(targets, type, key)) {
    return targets.filter((t) => !(t.type === type && t.key === key))
  }
  return [...targets, { type, key }]
}

export function CueTargetPicker({ selectedTargets, onChange, disabledKeys }: CueTargetPickerProps) {
  const { data: groups } = useGroupListQuery()
  const { data: fixtures } = useFixtureListQuery()

  const handleToggle = (type: CueTarget['type'], key: string) => {
    onChange(toggleTarget(selectedTargets, type, key))
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {groups && groups.length > 0 && (
        <>
          <div className="px-3 pt-1 pb-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Groups
          </div>
          {groups.map((group) => {
            const selected = isSelected(selectedTargets, 'group', group.name)
            const disabledReason = disabledKeys?.get(`group:${group.name}`)
            const isDisabled = disabledReason != null
            return (
              <button
                key={`group:${group.name}`}
                onClick={() => !isDisabled && handleToggle('group', group.name)}
                disabled={isDisabled}
                title={disabledReason ?? undefined}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors',
                  'min-h-[44px]',
                  isDisabled
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-accent/50 active:bg-accent cursor-pointer',
                  selected && !isDisabled && 'bg-accent ring-1 ring-primary/30',
                )}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={isDisabled}
                  onChange={() => {}}
                  className="rounded border-border pointer-events-none"
                />
                <Layers className="size-4 text-muted-foreground shrink-0" />
                <span className="truncate flex-1 text-left">{group.name}</span>
                {isDisabled && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {disabledReason}
                  </span>
                )}
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                  {group.memberCount}
                </Badge>
              </button>
            )
          })}
        </>
      )}

      {fixtures && fixtures.length > 0 && (
        <>
          <div className="px-3 pt-3 pb-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Fixtures
          </div>
          {fixtures.map((fixture) => {
            const selected = isSelected(selectedTargets, 'fixture', fixture.key)
            const disabledReason = disabledKeys?.get(`fixture:${fixture.key}`)
            const isDisabled = disabledReason != null
            return (
              <button
                key={`fixture:${fixture.key}`}
                onClick={() => !isDisabled && handleToggle('fixture', fixture.key)}
                disabled={isDisabled}
                title={disabledReason ?? undefined}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors',
                  'min-h-[44px]',
                  isDisabled
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-accent/50 active:bg-accent cursor-pointer',
                  selected && !isDisabled && 'bg-accent ring-1 ring-primary/30',
                )}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={isDisabled}
                  onChange={() => {}}
                  className="rounded border-border pointer-events-none"
                />
                <LayoutGrid className="size-4 text-muted-foreground shrink-0" />
                <span className="truncate flex-1 text-left">{fixture.name}</span>
                {isDisabled && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {disabledReason}
                  </span>
                )}
              </button>
            )
          })}
        </>
      )}

      {(!groups || groups.length === 0) && (!fixtures || fixtures.length === 0) && (
        <div className="px-3 py-8 text-center text-sm text-muted-foreground">
          No fixtures or groups configured
        </div>
      )}
    </div>
  )
}

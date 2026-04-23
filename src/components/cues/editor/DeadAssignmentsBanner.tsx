import { useMemo } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { describeHealth } from '@/lib/healthDescriptor'
import type { CuePropertyAssignment } from '@/api/cuesApi'

export { describeHealth }

interface DeadAssignmentsBannerProps {
  assignments: CuePropertyAssignment[]
  /** Called with the row index (into [assignments]) when the operator clicks Remove. */
  onRemove: (index: number) => void
}

/**
 * Phase 6 dead-reference banner. Lists any property-assignment rows whose target or
 * property doesn't resolve against the current patch. Each row gets a visible reason
 * + a one-click Remove action — the pragmatic "Rebind" (operator re-adds against the
 * current fixture from the grid below). Hides itself when every row is healthy.
 */
export function DeadAssignmentsBanner({
  assignments,
  onRemove,
}: DeadAssignmentsBannerProps) {
  const deadIndices = useMemo(
    () =>
      assignments
        .map((row, idx) => ({ row, idx }))
        .filter((entry) => entry.row.health && entry.row.health.type !== 'ok'),
    [assignments],
  )

  if (deadIndices.length === 0) return null

  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 p-2 space-y-1.5"
    >
      <div className="flex items-center gap-1.5 text-destructive text-xs font-medium">
        <AlertTriangle className="size-3.5" />
        {deadIndices.length} dead assignment{deadIndices.length === 1 ? '' : 's'}
        <span className="text-[11px] font-normal text-muted-foreground ml-1">
          — target or property no longer exists
        </span>
      </div>
      <ul className="space-y-1">
        {deadIndices.map(({ row, idx }) => (
          <li
            key={`${row.targetType}:${row.targetKey}:${row.propertyName}:${idx}`}
            className="flex items-center gap-2 text-[11px]"
          >
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              {row.targetType}
            </Badge>
            <span className="font-mono truncate">
              {row.targetKey}.{row.propertyName}
            </span>
            <span className="text-muted-foreground truncate">
              {describeHealth(row.health)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-6 px-1.5 text-[10px]"
              onClick={() => onRemove(idx)}
              title="Remove this assignment from the cue draft"
            >
              <X className="size-3 mr-0.5" /> Remove
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

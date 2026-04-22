import { useMemo } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { describeHealth } from '@/components/cues/editor/DeadAssignmentsBanner'
import type { FxPresetPropertyAssignment } from '@/api/fxPresetsApi'

interface DeadPresetAssignmentsBannerProps {
  assignments: FxPresetPropertyAssignment[]
  /** Called with the row index to drop from the draft. */
  onRemove: (index: number) => void
}

/**
 * Phase 6 dead-reference banner for preset editing. Flags any property assignment whose
 * `propertyName` isn't declared on the preset's current fixture type. Common cause: the
 * preset's fixture type was changed after assignments were authored, or the underlying
 * fixture class removed the property.
 */
export function DeadPresetAssignmentsBanner({
  assignments,
  onRemove,
}: DeadPresetAssignmentsBannerProps) {
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
        {deadIndices.length} dead property assignment
        {deadIndices.length === 1 ? '' : 's'}
        <span className="text-[11px] font-normal text-muted-foreground ml-1">
          — not valid for the current fixture type
        </span>
      </div>
      <ul className="space-y-1">
        {deadIndices.map(({ row, idx }) => (
          <li
            key={`${row.propertyName}:${idx}`}
            className="flex items-center gap-2 text-[11px]"
          >
            <span className="font-mono truncate">{row.propertyName}</span>
            <span className="text-muted-foreground truncate">
              {describeHealth(row.health)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-6 px-1.5 text-[10px]"
              onClick={() => onRemove(idx)}
              title="Remove this property assignment from the preset draft"
            >
              <X className="size-3 mr-0.5" /> Remove
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

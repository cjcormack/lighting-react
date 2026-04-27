import { Loader2 } from 'lucide-react'
import { CueDetailContent } from '@/components/cues/CueDetailContent'
import { cn } from '@/lib/utils'
import type { Cue } from '@/api/cuesApi'

interface RunOutputPaneProps {
  cue: Cue | null
  projectId: number
  /** True when the cue is currently outputting on stage (live). */
  isActive: boolean
  /** True when the cue is queued for the next GO. */
  isStandby: boolean
  /** True when the cue has already played. */
  isDone: boolean
  /** True when full cue data is still loading. */
  isLoading: boolean
}

/**
 * Output pane for the expanded Run cue card. Headline status pill ("Outputting
 * now" / "Queued — next GO" / "Played" / "Idle") plus the same read-only
 * summary used by `CueDetailSheet` (transition, palette, presets, effects,
 * triggers).
 */
export function RunOutputPane({
  cue,
  projectId,
  isActive,
  isStandby,
  isDone,
  isLoading,
}: RunOutputPaneProps) {
  const status = isActive
    ? 'Outputting now'
    : isStandby
      ? 'Queued — next GO'
      : isDone
        ? 'Played'
        : 'Idle'

  const assignmentCount = cue?.propertyAssignments.length ?? 0
  const effectCount = cue?.adHocEffects.length ?? 0
  const presetCount = cue?.presetApplications.length ?? 0

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px]',
            isActive
              ? 'border-green-900 bg-green-950/60 text-green-400'
              : 'border-border bg-muted/30 text-muted-foreground',
          )}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {status}
        </span>
        <span className="inline-flex items-center rounded border border-border bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
          {assignmentCount} assignment{assignmentCount !== 1 ? 's' : ''}
        </span>
        <span className="inline-flex items-center rounded border border-border bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
          {effectCount} effect{effectCount !== 1 ? 's' : ''}
        </span>
        {presetCount > 0 && (
          <span className="inline-flex items-center rounded border border-border bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
            {presetCount} preset{presetCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {!cue ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <span className="text-sm">Loading cue…</span>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <CueDetailContent cue={cue} projectId={projectId} />
        </div>
      )}
    </div>
  )
}

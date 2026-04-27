import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { MiniStage } from '@/components/runner/program/CueCardEditor/MiniStage'
import type { CueTarget } from '@/api/cuesApi'

interface RunTargetsPaneProps {
  projectId: number
  targets: CueTarget[]
}

/**
 * Read-only Targets pane for the expanded Run cue card: a compact stage map
 * highlighting the cue's targeted fixtures, then a chip list of every target
 * keyed by `${type}:${key}`. Groups render blue, fixtures render amber —
 * matching the chip styling used elsewhere in the runner.
 */
export function RunTargetsPane({ projectId, targets }: RunTargetsPaneProps) {
  if (targets.length === 0) {
    return (
      <div className="space-y-3">
        <MiniStage projectId={projectId} targets={[]} heightClass="h-32" />
        <p className="text-sm text-muted-foreground italic">
          No targets on this cue.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <MiniStage projectId={projectId} targets={targets} heightClass="h-32" />

      <div className="flex flex-wrap gap-1.5">
        {targets.map((t) => (
          <Badge
            key={`${t.type}:${t.key}`}
            variant="outline"
            className={cn(
              'text-[11px] px-1.5 py-0 max-w-[160px]',
              t.type === 'fixture'
                ? 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                : 'border-blue-500/40 text-blue-300 bg-blue-500/10',
            )}
          >
            <span className="truncate">{t.key}</span>
          </Badge>
        ))}
      </div>
    </div>
  )
}

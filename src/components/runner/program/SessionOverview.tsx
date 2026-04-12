import { ArrowRight, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ShowSessionDetails } from '@/api/showSessionsApi'
import type { CueStack } from '@/api/cueStacksApi'

interface SessionOverviewProps {
  session: ShowSessionDetails
  stacks: CueStack[]
  onDrillStack: (stackId: number) => void
  onSwitchToShow: () => void
}

export function SessionOverview({
  session,
  stacks,
  onDrillStack,
  onSwitchToShow,
}: SessionOverviewProps) {
  const stackMap = new Map(stacks.map((s) => [s.id, s]))
  const stackEntries = session.entries.filter((e) => e.entryType === 'STACK')
  const totalCues = stackEntries.reduce((n, e) => {
    const s = e.cueStackId != null ? stackMap.get(e.cueStackId) : null
    return n + (s?.cues.filter((c) => c.cueType === 'STANDARD').length ?? 0)
  }, 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center h-12 px-5 border-b bg-card gap-4 shrink-0">
        <span className="text-lg font-semibold text-muted-foreground/70 tracking-wide">
          {session.name}
        </span>
        <span className="text-xs text-muted-foreground/40 tracking-wider">
          {stackEntries.length} stacks &middot; {totalCues} cues
        </span>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="font-bold tracking-wider text-green-400 border-green-500/30 bg-green-950/40 hover:bg-green-900/50 hover:text-green-300"
          onClick={onSwitchToShow}
        >
          Ready to run <ArrowRight className="size-3.5 ml-1.5" />
        </Button>
      </div>

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
        {session.entries.map((entry, idx) => {
          if (entry.entryType === 'MARKER') {
            return (
              <div key={entry.id} className="flex items-center gap-2.5 py-1.5 px-4">
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-[10px] font-bold tracking-[0.13em] uppercase text-muted-foreground/40 px-2">
                  {entry.label}
                </span>
                <div className="flex-1 h-px bg-border/50" />
              </div>
            )
          }

          const stack = entry.cueStackId != null ? stackMap.get(entry.cueStackId) : null
          const cueCount = stack?.cues.filter((c) => c.cueType === 'STANDARD').length ?? 0

          return (
            <button
              key={entry.id}
              className="flex items-center w-full gap-3 px-4 py-2.5 bg-card border rounded transition-colors hover:bg-muted/30 hover:border-muted-foreground/20 text-left"
              onClick={() => entry.cueStackId != null && onDrillStack(entry.cueStackId)}
            >
              <span className="w-6 text-center font-mono text-[11px] text-muted-foreground/30 shrink-0">
                {idx + 1}
              </span>
              <span className="flex-1 text-sm font-semibold text-muted-foreground/60">
                {entry.cueStackName ?? entry.label ?? 'Unknown'}
              </span>
              <span className="text-[11px] text-muted-foreground/30 shrink-0">
                {cueCount} cues
              </span>
              {stack?.loop && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-1">
                  <RotateCcw className="size-2.5" />
                  Loop
                </Badge>
              )}
              <ArrowRight className="size-4 text-muted-foreground/30 shrink-0" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

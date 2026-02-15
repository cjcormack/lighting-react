import { useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useFxStateQuery, tapTempo } from '../store/fx'
import { BeatIndicator } from './BeatIndicator'

interface EffectsOverviewPanelProps {
  isVisible: boolean
}

export function EffectsOverviewPanel({ isVisible }: EffectsOverviewPanelProps) {
  const { data: fxState, isLoading } = useFxStateQuery()

  const handleTap = useCallback(() => {
    tapTempo()
  }, [])

  const runningCount = fxState?.activeEffects.filter((e) => e.isRunning).length ?? 0
  const totalCount = fxState?.activeEffects.length ?? 0

  return (
    <div
      className={cn(
        'grid transition-all duration-200 ease-in-out',
        isVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      )}
    >
      <div className="overflow-hidden">
        <div className="border-b bg-background px-4 py-3">
          {isLoading ? (
            <div className="flex justify-center">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {/* Beat Indicator + BPM Display */}
              <div className="flex items-center gap-3">
                <BeatIndicator />
                <span className="text-sm font-medium text-muted-foreground">BPM</span>
                <span className="min-w-[5ch] text-right text-2xl font-bold tabular-nums">
                  {fxState?.bpm.toFixed(1) ?? '—'}
                </span>
              </div>

              {/* Tap Button */}
              <Button variant="outline" size="sm" onClick={handleTap}>
                Tap
              </Button>

              {/* Running FX Summary */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {totalCount === 0
                    ? 'No active effects'
                    : `${runningCount} running / ${totalCount} effect${totalCount !== 1 ? 's' : ''}`}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

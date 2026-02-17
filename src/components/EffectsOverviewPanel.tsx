import { useCallback } from 'react'
import { Loader2, OctagonX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useFxStateQuery, tapTempo } from '@/store/fx'
import { useRemoveFxMutation } from '@/store/fixtureFx'
import { BeatIndicator } from './BeatIndicator'

interface EffectsOverviewPanelProps {
  isVisible: boolean
  /** When locked (FX view), show extended controls like Kill All */
  isLocked?: boolean
}

export function EffectsOverviewPanel({ isVisible, isLocked }: EffectsOverviewPanelProps) {
  const { data: fxState, isLoading } = useFxStateQuery()
  const [removeFx] = useRemoveFxMutation()

  const handleTap = useCallback(() => {
    tapTempo()
  }, [])

  const handleKillAll = useCallback(async () => {
    if (!fxState?.activeEffects.length) return
    await Promise.all(
      fxState.activeEffects.map((effect) =>
        removeFx({ id: effect.id, fixtureKey: effect.targetKey }).unwrap().catch(() => {}),
      ),
    )
  }, [fxState, removeFx])

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

              {/* Kill All - shown when in FX view (locked) */}
              {isLocked && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleKillAll}
                  disabled={totalCount === 0}
                  className="ml-auto"
                >
                  <OctagonX className="size-4 mr-1" />
                  Kill All
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

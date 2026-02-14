import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useFxStateQuery, tapTempo, subscribeToBeat } from '../store/fx'

interface EffectsOverviewPanelProps {
  isVisible: boolean
}

function BeatIndicator() {
  const { data: fxState } = useFxStateQuery()
  const [beat, setBeat] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bpmRef = useRef(fxState?.bpm ?? 120)

  const flash = useCallback(() => {
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current)
    }
    setBeat(true)
    flashTimeoutRef.current = setTimeout(() => setBeat(false), 80)
  }, [])

  const startInterval = useCallback((bpm: number) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    intervalRef.current = setInterval(flash, 60000 / bpm)
  }, [flash])

  // Start the local beat interval on mount
  useEffect(() => {
    startInterval(bpmRef.current)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current)
      }
    }
  }, [startInterval])

  // Use beatSync only to correct BPM drift — do not flash directly
  useEffect(() => {
    const subscription = subscribeToBeat((beatSync) => {
      if (beatSync.bpm !== bpmRef.current) {
        bpmRef.current = beatSync.bpm
        startInterval(beatSync.bpm)
      }
    })
    return () => subscription.unsubscribe()
  }, [startInterval])

  return (
    <div
      className={cn(
        'size-3 rounded-full transition-colors duration-75',
        beat ? 'bg-primary' : 'bg-muted-foreground/25'
      )}
    />
  )
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

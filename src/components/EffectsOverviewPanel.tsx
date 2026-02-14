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
  const [synced, setSynced] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFlashTimeRef = useRef(0)
  const bpmRef = useRef(fxState?.bpm ?? 120)

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const flash = useCallback(() => {
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current)
    }
    lastFlashTimeRef.current = Date.now()
    setBeat(true)
    flashTimeoutRef.current = setTimeout(() => setBeat(false), 80)
  }, [])

  const startInterval = useCallback((bpm: number) => {
    stopInterval()
    intervalRef.current = setInterval(flash, 60000 / bpm)
  }, [flash, stopInterval])

  // When we lose sync, stop flashing
  useEffect(() => {
    if (!synced) {
      stopInterval()
    }
  }, [synced, stopInterval])

  // Detect tab visibility changes — mark as unsynced when returning
  // from a hidden state, since the local interval drifts while
  // backgrounded.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setSynced(false)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Every beatSync (every 16 beats): sync to the server's beat boundary.
  useEffect(() => {
    const subscription = subscribeToBeat((beatSync) => {
      bpmRef.current = beatSync.bpm

      const wasSynced = synced
      if (!synced) {
        setSynced(true)
      }

      // Flash unless the local timer just flashed for this beat
      const minGap = (60000 / beatSync.bpm) / 2
      if (!wasSynced || Date.now() - lastFlashTimeRef.current > minGap) {
        flash()
      }

      startInterval(beatSync.bpm)
    })
    return () => subscription.unsubscribe()
  }, [flash, startInterval, synced])

  // Cleanup
  useEffect(() => {
    return () => {
      stopInterval()
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current)
      }
    }
  }, [stopInterval])

  return (
    <div
      className={cn(
        'size-3 rounded-full',
        synced
          ? cn('transition-colors duration-75', beat ? 'bg-primary' : 'bg-muted-foreground/25')
          : 'border border-muted-foreground/40'
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

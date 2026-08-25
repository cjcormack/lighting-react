import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  requestSpeedMasterBeat,
  subscribeToSpeedMasterBeat,
  useMaster1Uuid,
} from '../store/speedMasters'

/** Which master this dot beats for. Omitted → master 1. */
export interface BeatIndicatorMaster {
  /** May be null for master 1 — callers that only hold the write-side convention. */
  uuid: string | null
  index: number
}

/**
 * A dot that pulses on the beat.
 *
 * Server frames are throttled (one every 16 beats), so the dot free-runs on a local interval
 * between them and uses each frame to re-align. Until the first frame arrives it renders as
 * an empty ring — "not synced" is shown rather than guessed.
 *
 * Always reads the keyed `speedMasters.beat` stream, so a dot beside a master-2 effect beats
 * at master 2's tempo. Omitting [master], or passing master 1 with a null uuid, resolves to
 * master 1's real uuid via [useMaster1Uuid] — see there for why null cannot be used directly.
 */
export function BeatIndicator({
  className,
  master,
}: {
  className?: string
  master?: BeatIndicatorMaster | null
}) {
  const master1Uuid = useMaster1Uuid()
  const target = master?.uuid ?? master1Uuid
  const [beat, setBeat] = useState(false)
  const [synced, setSynced] = useState(false)
  // Mirrors `synced` for the subscribe effect to read without listing it as a dependency:
  // otherwise every regain of sync tears the subscription down and re-creates it (sending a
  // redundant requestBeat), when the only thing that should re-bind it is the master.
  const syncedRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFlashTimeRef = useRef(0)

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

  const markUnsynced = useCallback(() => {
    syncedRef.current = false
    setSynced(false)
  }, [])

  // Switching which master this dot follows invalidates the local timer — it is still
  // ticking at the old master's tempo — so drop back to unsynced until the new master's
  // first frame lands.
  useEffect(() => {
    markUnsynced()
  }, [target, markUnsynced])

  // Detect tab visibility changes — mark as unsynced when returning from a hidden state,
  // since the local interval drifts while backgrounded, and ask for a frame now. The
  // subscription below is still good, so this asks explicitly rather than re-subscribing:
  // waiting out the throttle would leave the dot an empty ring for up to 16 beats (~8s at
  // 120 BPM, ~48s at the 20 BPM floor).
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markUnsynced()
        requestSpeedMasterBeat(target)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [markUnsynced, target])

  // Every server frame: re-align to the beat boundary and re-seed the local interval.
  // Keyed on `target` alone — subscribing sends a requestBeat, so re-binding for any other
  // reason costs a redundant round trip.
  useEffect(() => {
    const onServerBeat = (bpm: number) => {
      const wasSynced = syncedRef.current
      if (!wasSynced) {
        syncedRef.current = true
        setSynced(true)
      }

      // Flash unless the local timer just flashed for this beat
      const minGap = (60000 / bpm) / 2
      if (!wasSynced || Date.now() - lastFlashTimeRef.current > minGap) {
        flash()
      }

      startInterval(bpm)
    }

    const subscription = subscribeToSpeedMasterBeat(target, (b) => onServerBeat(b.bpm))
    return () => subscription.unsubscribe()
  }, [flash, startInterval, target])

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
          : 'border border-muted-foreground/40',
        className
      )}
    />
  )
}

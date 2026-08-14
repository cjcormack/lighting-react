import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { subscribeToBeat, requestBeatSync } from '../store/fx'
import { subscribeToSpeedMasterBeat } from '../store/speedMasters'

/** Which master this dot beats for. Omitted (or master 1) uses the legacy `beatSync` stream. */
export interface BeatIndicatorMaster {
  /** Null for master 1 — the same convention the tempo-write messages use. */
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
 * Without [master] — or with master 1 — this reads the legacy unkeyed `beatSync` stream,
 * which is wired to master 1's clock object and cannot speak for any other master. Give it a
 * master and it reads the keyed `speedMasters.beat` stream instead, so a dot beside a
 * master-2 effect beats at master 2's tempo.
 */
export function BeatIndicator({
  className,
  master,
}: {
  className?: string
  master?: BeatIndicatorMaster | null
}) {
  // Master 1 stays on the legacy stream: it is the same clock either way, and leaving it
  // alone means the two existing call sites keep their exact behaviour.
  const keyedUuid = master != null && master.index !== 1 ? master.uuid : undefined
  const [beat, setBeat] = useState(false)
  const [synced, setSynced] = useState(false)
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

  // Switching which master this dot follows invalidates the local timer — it is still
  // ticking at the old master's tempo — so drop back to unsynced until the new master's
  // first frame lands.
  useEffect(() => {
    setSynced(false)
  }, [keyedUuid])

  // Request a sync on mount so we don't wait out the throttle. The keyed path does this
  // inside subscribeBeat, so only the legacy stream needs an explicit nudge here.
  useEffect(() => {
    if (keyedUuid === undefined) requestBeatSync()
  }, [keyedUuid])

  // Detect tab visibility changes — mark as unsynced when returning
  // from a hidden state, since the local interval drifts while
  // backgrounded. Request an immediate beat sync from the server.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setSynced(false)
        if (keyedUuid === undefined) requestBeatSync()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [keyedUuid])

  // Every server frame: re-align to the beat boundary and re-seed the local interval.
  // Re-subscribing on `keyedUuid` change also re-sends the request, which is what recovers
  // sync after the visibility reset above.
  useEffect(() => {
    const onServerBeat = (bpm: number) => {
      const wasSynced = synced
      if (!synced) {
        setSynced(true)
      }

      // Flash unless the local timer just flashed for this beat
      const minGap = (60000 / bpm) / 2
      if (!wasSynced || Date.now() - lastFlashTimeRef.current > minGap) {
        flash()
      }

      startInterval(bpm)
    }

    const subscription =
      keyedUuid === undefined
        ? subscribeToBeat((beatSync) => onServerBeat(beatSync.bpm))
        : subscribeToSpeedMasterBeat(keyedUuid, (b) => onServerBeat(b.bpm))
    return () => subscription.unsubscribe()
  }, [flash, startInterval, synced, keyedUuid])

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

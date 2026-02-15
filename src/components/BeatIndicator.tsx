import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useFxStateQuery, subscribeToBeat, requestBeatSync } from '../store/fx'

export function BeatIndicator({ className }: { className?: string }) {
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

  // Request a beat sync on mount so we don't wait up to 16 beats
  useEffect(() => {
    requestBeatSync()
  }, [])

  // Detect tab visibility changes — mark as unsynced when returning
  // from a hidden state, since the local interval drifts while
  // backgrounded. Request an immediate beat sync from the server.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setSynced(false)
        requestBeatSync()
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
          : 'border border-muted-foreground/40',
        className
      )}
    />
  )
}

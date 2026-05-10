import { useCallback, useEffect, useState } from 'react'

export interface StageViewFlags {
  regions: boolean
  riggings: boolean
  fixtures: boolean
  labels: boolean
  beamCones: boolean
}

export const DEFAULT_VIEW_FLAGS: StageViewFlags = {
  regions: true,
  riggings: true,
  fixtures: true,
  labels: true,
  beamCones: true,
}

const STORAGE_KEY = 'stageViewFlags'

function load(): StageViewFlags {
  if (typeof window === 'undefined') return DEFAULT_VIEW_FLAGS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_VIEW_FLAGS
    const parsed = JSON.parse(raw) as Partial<StageViewFlags>
    return { ...DEFAULT_VIEW_FLAGS, ...parsed }
  } catch {
    return DEFAULT_VIEW_FLAGS
  }
}

export function useStageView() {
  const [flags, setFlags] = useState<StageViewFlags>(load)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(flags))
    } catch {
      // ignore quota / private mode failures
    }
  }, [flags])

  const setFlag = useCallback(<K extends keyof StageViewFlags>(key: K, value: boolean) => {
    setFlags((prev) => ({ ...prev, [key]: value }))
  }, [])

  return { flags, setFlag }
}

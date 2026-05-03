import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Loader2 } from 'lucide-react'
import { useViewedProject } from '../ProjectSwitcher'
import { useCurrentProjectQuery } from '../store/projects'
import { Stage3D } from '../components/stage3d/Stage3D'
import { StageOverviewPanel } from '../components/StageOverviewPanel'

type Mode = '2d' | '3d'

const STORAGE_KEY = 'stageViewMode'

function loadMode(): Mode {
  if (typeof window === 'undefined') return '3d'
  const v = window.localStorage.getItem(STORAGE_KEY)
  return v === '2d' ? '2d' : '3d'
}

function useStageViewMode(): [Mode, (m: Mode) => void] {
  const [mode, setModeState] = useState<Mode>(loadMode)
  const setMode = (m: Mode) => {
    setModeState(m)
    try {
      window.localStorage.setItem(STORAGE_KEY, m)
    } catch {
      // ignore quota / private mode failures
    }
  }
  return [mode, setMode]
}

export function Stage() {
  const project = useViewedProject()
  const projectId = project?.id
  const [mode, setMode] = useStageViewMode()
  const [selectedFixtureKey, setSelectedFixtureKey] = useState<string | null>(null)

  if (projectId == null) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <h1 className="text-sm font-semibold">Stage</h1>
        <div className="flex-1" />
        <ToggleGroup
          type="single"
          size="sm"
          value={mode}
          onValueChange={(v) => {
            if (v === '2d' || v === '3d') setMode(v)
          }}
        >
          <ToggleGroupItem value="3d">3D</ToggleGroupItem>
          <ToggleGroupItem value="2d">2D</ToggleGroupItem>
        </ToggleGroup>
      </header>
      <main className="flex-1 min-h-0 overflow-hidden">
        {mode === '3d' ? (
          <Stage3D
            projectId={projectId}
            selectedFixtureKey={selectedFixtureKey}
            onFixtureClick={setSelectedFixtureKey}
          />
        ) : (
          <StageOverviewPanel
            isVisible
            selectedFixtureKey={selectedFixtureKey}
            onFixtureClick={setSelectedFixtureKey}
          />
        )}
      </main>
    </div>
  )
}

// Bare /stage redirect — follow current project, mirror FixturesRedirect.
export function StageRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/stage`, { replace: true })
    }
  }, [currentProject, isLoading, navigate])

  if (isLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  return <Navigate to="/projects" replace />
}

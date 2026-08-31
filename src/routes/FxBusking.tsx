import { useCallback, useState, useRef } from 'react'
import { useParams, Navigate } from 'react-router'
import { Card } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import { BuskingView } from '../components/busking/BuskingView'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { CurrentProjectRedirect } from '../components/CurrentProjectRedirect'

// Redirect component for /fx route
export function FxRedirect() {
  return <CurrentProjectRedirect to="fx" />
}

// Main FX Busking route component
export function ProjectFxBusking() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)

  const [selectedNames, setSelectedNames] = useState<string[]>([])
  const controlsRef = useRef<{ clearSelection: () => void; openTargetPicker: () => void } | null>(null)

  const handleSelectionChange = useCallback(
    (names: string[], controls: { clearSelection: () => void; openTargetPicker: () => void }) => {
      setSelectedNames(names)
      controlsRef.current = controls
    },
    [],
  )

  const handleCurrentPageClick = useCallback(() => {
    controlsRef.current?.clearSelection()
  }, [])

  const handleExtraClick = useCallback((_index: number) => {
    controlsRef.current?.openTargetPicker()
  }, [])

  if (!currentLoading && currentProject && projectIdNum !== currentProject.id) {
    return <Navigate to={`/projects/${currentProject.id}/fx`} replace />
  }

  if (projectLoading || currentLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  if (!project) {
    return (
      <Card className="m-4 p-4 text-center text-muted-foreground">
        Project not found
      </Card>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2">
        <Breadcrumbs
          projectName={project.name}
          currentPage="FX"
          extra={selectedNames.length > 0 ? selectedNames : undefined}
          onCurrentPageClick={handleCurrentPageClick}
          onExtraClick={handleExtraClick}
        />
      </div>
      <div className="flex-1 min-h-0">
        <BuskingView onSelectionChange={handleSelectionChange} />
      </div>
    </div>
  )
}

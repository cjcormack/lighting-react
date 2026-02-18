import { useEffect, useCallback, useState, useRef } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import { BuskingView } from '../components/busking/BuskingView'
import { Breadcrumbs } from '../components/Breadcrumbs'

// Redirect component for /fx route
export function FxRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/fx`, { replace: true })
    }
  }, [currentProject, isLoading, navigate])

  if (isLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  return null
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

  const handleExtraClick = useCallback(() => {
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

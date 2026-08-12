import { Suspense, useEffect } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { Card } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { ProgrammerViewSwitcher } from '../components/ViewSwitcher'
import { ProgrammerSheet } from '../components/programmer/ProgrammerSheet'
import { FxSheet } from '../components/programmer/FxSheet'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import { LIST_PAGE_CARD_CLASS } from './FixturesList'

/** Bare `/programmer` → the active project's programmer. */
export function ProgrammerRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/programmer`, { replace: true })
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

/**
 * The programmer's two sibling views. Only `values` is in the navigation registry — `fx` is
 * reached through the in-page switcher, following the cards/list precedent in CLAUDE.md
 * (one sidebar row per resource).
 */
export function ProgrammerPage({ view }: { view: 'values' | 'fx' }) {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const { search } = useLocation()
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)

  // The programmer writes to the live rig, so it only makes sense on the active project.
  if (!currentLoading && currentProject && projectIdNum !== currentProject.id) {
    const suffix = view === 'fx' ? '/fx' : ''
    return <Navigate to={`/projects/${currentProject.id}/programmer${suffix}${search}`} replace />
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
      <Card className="m-4 p-4">
        <p className="text-destructive">Project not found</p>
      </Card>
    )
  }

  return (
    <Card className={LIST_PAGE_CARD_CLASS}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs projectName={project.name} currentPage="Programmer" />
        <ProgrammerViewSwitcher current={view} projectId={projectIdNum} />
      </div>
      <Suspense fallback={<div>Loading...</div>}>
        {view === 'values' ? <ProgrammerSheet /> : <FxSheet />}
      </Suspense>
    </Card>
  )
}

import { Suspense, useEffect } from 'react'
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { Card } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { Breadcrumbs } from '../components/Breadcrumbs'
import {
  GROUPS_VIEW_KEY,
  GroupsViewSwitcher,
  setStoredCardsListView,
} from '../components/ViewSwitcher'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import { FixturesListContainer, LIST_PAGE_CARD_CLASS } from './FixturesList'

// Redirect component for the bare /groups/list route
export function GroupsListRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    if (!isLoading && currentProject) {
      const query = searchParams.toString()
      navigate(`/projects/${currentProject.id}/groups/list${query ? `?${query}` : ''}`, {
        replace: true,
      })
    }
  }, [currentProject, isLoading, navigate, searchParams])

  if (isLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  return null
}

export function ProjectGroupsList() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const { search } = useLocation()
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)

  // Record this as the last-used groups view even when arriving via a deep
  // link (Cmd+K ?select=) rather than the switcher, so the sidebar's "Groups"
  // entry keeps landing here.
  useEffect(() => {
    setStoredCardsListView(GROUPS_VIEW_KEY, 'list')
  }, [])

  if (!currentLoading && currentProject && projectIdNum !== currentProject.id) {
    // Carry ?select= across, matching GroupsListRedirect — a shared link's
    // deep-link target shouldn't be dropped just because the project id in
    // the URL wasn't the active one.
    return <Navigate to={`/projects/${currentProject.id}/groups/list${search}`} replace />
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
      {/* `@container` — see ViewSwitcher's LABEL_AT_* constants. */}
      <div className="@container mb-4 flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs projectName={project.name} currentPage="Groups" />
        <GroupsViewSwitcher current="list" projectId={projectIdNum} />
      </div>
      <Suspense fallback={<div>Loading...</div>}>
        <FixturesListContainer grouped selectionScope="groups" />
      </Suspense>
    </Card>
  )
}

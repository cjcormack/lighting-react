import { Suspense, useState, useEffect } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import { useGroupListQuery } from '../store/groups'
import { GroupCard } from '../components/groups/GroupCard'
import { FixtureDetailModal } from '../components/groups/FixtureDetailModal'
import { Breadcrumbs } from '../components/Breadcrumbs'

// Redirect component for /groups route
export function GroupsRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/groups`, { replace: true })
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

// Main ProjectGroups route component
export function ProjectGroups() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)

  // If viewing a non-current project, redirect to the current project
  if (!currentLoading && currentProject && projectIdNum !== currentProject.id) {
    return <Navigate to={`/projects/${currentProject.id}/groups`} replace />
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
    <Card className="m-4 p-4">
      <div className="mb-4">
        <Breadcrumbs projectName={project.name} currentPage="Groups" />
      </div>
      <Suspense fallback={<GroupsLoading />}>
        <GroupsContainer />
      </Suspense>
    </Card>
  )
}

function GroupsLoading() {
  return (
    <div className="flex justify-center py-8">
      <Loader2 className="size-6 animate-spin" />
    </div>
  )
}

function GroupsContainer() {
  const { data: groups, isLoading } = useGroupListQuery()
  const [selectedFixture, setSelectedFixture] = useState<string | null>(null)

  if (isLoading) {
    return <GroupsLoading />
  }

  if (!groups || groups.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No fixture groups configured.
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {groups.map((group) => (
          <GroupCard
            key={group.name}
            group={group}
            onFixtureClick={setSelectedFixture}
          />
        ))}
      </div>

      <FixtureDetailModal
        fixtureKey={selectedFixture}
        onClose={() => setSelectedFixture(null)}
      />
    </>
  )
}

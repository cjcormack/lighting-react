import { useEffect } from 'react'
import { useNavigate, useParams, Navigate } from 'react-router'
import { Card } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { useCurrentProjectQuery } from '../store/projects'

/**
 * What is left of the Run view: two redirects into `/show`.
 *
 * Run and Show merged in desk-simplification session 2b. They were never different destinations —
 * the only real distinction was whether a stray click can change the show, which is a *mode*, and
 * one the Prompt Book already modelled well. So the lock came across instead of the route, and
 * `/show` now serves both jobs: locked it is the runner, unlocked it is the editor, and both levels
 * of the view survive in both modes.
 *
 * Keeping the redirects rather than deleting the paths outright: `/run` was never an external
 * contract the way `?cue=` is, but Cmd+K deep links, bookmarks and muscle memory all exist, and a
 * redirect is cheaper than any of them being a blank page.
 */
function ShowRedirectForCurrentProject() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/show`, { replace: true })
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

/** `/projects/:id/run` → `/projects/:id/show`. */
export function LegacyRunRedirect() {
  const { projectId } = useParams()
  if (projectId) {
    return <Navigate to={`/projects/${projectId}/show`} replace />
  }
  return <ShowRedirectForCurrentProject />
}

/**
 * Legacy `/cue-stacks` and `/projects/:id/cue-stacks` → `/show`.
 *
 * These once pointed at Run, and `/show` used to redirect here as well — the *playback* view was
 * called Show before it became Run. Both names now name one view, so there is no longer a
 * distinction for an old link to land on the wrong side of.
 */
export function LegacyCueStacksRedirect() {
  const { projectId } = useParams()
  if (projectId) {
    return <Navigate to={`/projects/${projectId}/show`} replace />
  }
  return <ShowRedirectForCurrentProject />
}

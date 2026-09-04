import { Navigate, useParams } from 'react-router'
import { Card } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { ShowBar } from '@/components/ShowBar'
import { ShowHeader } from '@/components/ShowHeader'
import { useShowBarProps } from '@/hooks/useShowBarProps'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import { BuskingView } from '../components/busking/BuskingView'
import { CurrentProjectRedirect } from '../components/CurrentProjectRedirect'

/** Bare `/busk` → the current project's busk view. Mirrors `ShowRedirect` and `ProgrammerRedirect`. */
export function BuskRedirect() {
  return <CurrentProjectRedirect to="busk" />
}

/**
 * Busk — the pad-first performance surface, and the fourth live view.
 *
 * It was `/projects/:id/fx`, a breadcrumb band over the pad grid with no show chrome at all: an
 * operator busking here could not see the cue they were on and could not GO. It is a live view in
 * every sense the other three are, so it takes the same header and the same bar, from the same
 * hook — see `useShowBarProps`, whose whole point is that no host wires the bar by hand.
 *
 * Two props it deliberately does **not** pass:
 *
 *  - `showShortcuts`, because this page binds no transport keys. It is the one prop each host
 *    answers for itself, and answering it "yes" here would advertise keys nothing listens for.
 *  - `canOperate`. GO must work from a busk pad — that is the plan's D9, and the show-editing lock
 *    is a stray-click guard for editing surfaces rather than a transport gate.
 *
 * `frameRateProgress: false` for the reason `ProgrammerPage` passes it. The cue column reads
 * `transport`'s *cursors*, which move once per cue, but nothing here reads `fadeProgress` — so the
 * flag still keeps a running fade from re-rendering the whole pad grid every frame.
 */
export function ProjectBusk() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const { showBarProps, showHeaderProps } = useShowBarProps(projectIdNum, {
    frameRateProgress: false,
  })

  if (!currentLoading && currentProject && projectIdNum !== currentProject.id) {
    // Deliberately without the search string, unlike `/program*` → `/show`: `?page=` names a busk
    // page **id**, which is scoped to a project, so carrying it to another one would name nothing.
    return <Navigate to={`/projects/${currentProject.id}/busk`} replace />
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
    <div className="flex h-full flex-col">
      <ShowHeader
        view="busk"
        projectId={projectIdNum}
        projectName={project.name}
        {...showHeaderProps}
      />
      {/* Not gated on the show running — same reasoning as `ShowPage` and `ProgrammerPage`.
          Blackout, Blind and the speed masters all mean something with the show down, and
          `goDisabled` already mutes BACK/GO. */}
      <ShowBar {...showBarProps} />
      <BuskingView projectId={projectIdNum} />
    </div>
  )
}

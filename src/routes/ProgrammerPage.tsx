import { useEffect } from 'react'
import { Layers, Loader2 } from 'lucide-react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ShowBar } from '@/components/ShowBar'
import { ShowHeader } from '@/components/ShowHeader'
import { EditorContextProvider } from '@/components/lighting-editor/EditorContext'
import { ProgrammerActionBar } from '@/components/programmer/ProgrammerActionBar'
import { ColumnsMenu, useColumnVisibility } from '@/components/fixtures-list/ColumnsMenu'
import { ProgrammerGrid } from '@/components/programmer/ProgrammerGrid'
import { ProgrammerRail } from '@/components/programmer/ProgrammerRail'
import {
  ProgrammerSheetsProvider,
  useProgrammerSheets,
} from '@/components/programmer/ProgrammerSheets'
import { ProgrammerSourceStrip } from '@/components/programmer/ProgrammerSourceStrip'
import { ProgrammerWorkspace } from '@/components/programmer/ProgrammerWorkspace'
import { useInclude } from '@/components/programmer/useInclude'
import { usePersistentState } from '@/hooks/usePersistentState'
import { useShowBarProps } from '@/hooks/useShowBarProps'
import { includedCueId } from '@/lib/includedTarget'
import { programmerClearAll, useProgrammerSummaryQuery } from '@/store/programmer'
import { useCurrentProjectQuery, useProjectQuery } from '@/store/projects'

const GROUPED_KEY = 'programmer.grouped'

/** Bare `/programmer` → the current project's programmer. Mirrors `ShowRedirect`. */
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
 * `/programmer/fx` → `/programmer`.
 *
 * FX was a route of its own when the FX sheet was a destination, then a tab, and is now a band of
 * the page that is always on screen. Kept only so a bookmark lands.
 */
export function ProgrammerFxRedirect() {
  const { projectId } = useParams()
  return <Navigate to={projectId ? `/projects/${projectId}/programmer` : '/programmer'} replace />
}

/**
 * `/projects/:id/program*` → `/projects/:id/show*`.
 *
 * Program was renamed to Show when the programmer became a page of its own — two live views one
 * letter apart was the collision that kept the programmer out of the nav last time. The search
 * string is carried across because `?cue=` deep links are how Run and the Prompt Book's "Edit Cue"
 * reach a specific cue.
 */
export function LegacyProgramRedirect() {
  const { projectId, stackId } = useParams()
  const { search } = useLocation()
  const base = stackId
    ? `/projects/${projectId}/show/stacks/${stackId}`
    : `/projects/${projectId}/show`
  return <Navigate to={`${base}${search}`} replace />
}

/**
 * The programmer, as a place.
 *
 * It was a page, then three tabs — Values / Layers / FX — of a pane collapsed inside the Show view,
 * and is a page again. The tabs were the problem: they are three readings of *one live object*, so
 * putting them behind a switcher meant the operator could never watch the layer stack that produced
 * the values they were editing. Everything is on screen at once here, which is the entire point.
 *
 * Six bands, deliberately separate siblings rather than one header component — Session 2 inserts a
 * scope band and a contextual template strip between the action bar and the workspace.
 */
export function ProgrammerPage() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const { isShowActive, showBarProps, showHeaderProps } = useShowBarProps(projectIdNum)

  if (currentLoading || projectLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  if (!Number.isFinite(projectIdNum)) {
    return currentProject ? (
      <Navigate to={`/projects/${currentProject.id}/programmer`} replace />
    ) : null
  }

  if (!project) {
    return (
      <Card className="m-4 p-4">
        <p className="text-muted-foreground">Project not found</p>
      </Card>
    )
  }

  return (
    <ProgrammerSheetsProvider projectId={projectIdNum}>
      <div className="flex h-full flex-col">
        <ShowHeader
          view="programmer"
          projectId={projectIdNum}
          projectName={project.name}
          {...showHeaderProps}
        />
        {isShowActive && <ShowBar {...showBarProps} />}
        <ProgrammerBody projectId={projectIdNum} />
      </div>
    </ProgrammerSheetsProvider>
  )
}

/**
 * Split from `ProgrammerPage` only so it sits *inside* `ProgrammerSheetsProvider` and can call
 * `useProgrammerSheets`.
 */
function ProgrammerBody({ projectId }: { projectId: number }) {
  const sheets = useProgrammerSheets()
  const { data: summary } = useProgrammerSummaryQuery()
  const { includeCue } = useInclude(projectId)
  // Grouping is a toggle rather than a route split: busking a whole wash wants group rows, plotting
  // an individual mover wants the flat list, and both are the same grid.
  const [grouped, setGrouped] = usePersistentState<boolean>(GROUPED_KEY, false)
  // Owned here rather than inside the grid because the menu renders in the action bar, which is a
  // full-width band above the workspace the grid sits in.
  const [columnVisibility, setColumnVisibility] = useColumnVisibility()

  const cueId = includedCueId(summary?.lastIncluded ?? null)

  // Revert is drop-everything-then-re-Include. There is no server-side revert, and those two steps
  // in that order are what the operator means: throw away the busk, load the cue again.
  const handleRevert = () => {
    programmerClearAll(0)
    if (cueId != null) void includeCue(cueId)
  }

  return (
    <>
      <ProgrammerSourceStrip
        projectId={projectId}
        onUpdate={sheets.openUpdate}
        onRevert={handleRevert}
        onRecord={() => sheets.openRecord()}
      />

      <ProgrammerActionBar
        projectId={projectId}
        sheetControls={
          <>
            <Button
              variant={grouped ? 'default' : 'outline'}
              size="sm"
              aria-pressed={grouped}
              onClick={() => setGrouped(!grouped)}
              title="Show group rows with their members"
            >
              <Layers className="size-3.5" />
              <span className="hidden @[560px]:inline">Groups</span>
            </Button>
            <ColumnsMenu visibility={columnVisibility} onChange={setColumnVisibility} />
          </>
        }
      />

      {/* Session 2 inserts the scope band and the contextual template strip here, between the
          action bar and the workspace. */}

      <EditorContextProvider value={{ kind: 'live' }}>
        <ProgrammerWorkspace
          grid={
            <ProgrammerGrid
              grouped={grouped}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
            />
          }
          rail={<ProgrammerRail />}
        />
      </EditorContextProvider>
    </>
  )
}

import { memo } from 'react'
import { Layers, Loader2 } from 'lucide-react'
import { Navigate, useLocation, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ShowBar } from '@/components/ShowBar'
import { ShowHeader } from '@/components/ShowHeader'
import { EditorContextProvider } from '@/components/programmer/EditorContext'
import { ProgrammerActionBar } from '@/components/programmer/ProgrammerActionBar'
import { ColumnsMenu, useColumnVisibility } from '@/components/fixtures-list/ColumnsMenu'
import { ProgrammerGrid } from '@/components/programmer/ProgrammerGrid'
import { LookRowStoreProvider } from '@/components/programmer/LookRowStore'
import { ProgrammerRail } from '@/components/programmer/ProgrammerRail'
import { ProgrammerScopeProvider } from '@/components/programmer/ProgrammerScope'
import { ProgrammerScopeBand } from '@/components/programmer/ProgrammerScopeBand'
import {
  ProgrammerSheetsProvider,
  useProgrammerSheets,
} from '@/components/programmer/ProgrammerSheets'
import { ProgrammerSourceStrip } from '@/components/programmer/ProgrammerSourceStrip'
import { ProgrammerWorkspace } from '@/components/programmer/ProgrammerWorkspace'
import { useInclude } from '@/components/programmer/useInclude'
import { usePersistentState } from '@/hooks/usePersistentState'
import { useShowBarProps } from '@/hooks/useShowBarProps'
import { lightingApi } from '@/api/lightingApi'
import { includedCueId } from '@/lib/includedTarget'
import { programmerClearAll } from '@/store/programmer'
import { useCurrentProjectQuery, useProjectQuery } from '@/store/projects'
import { CurrentProjectRedirect } from '@/components/CurrentProjectRedirect'

const GROUPED_KEY = 'programmer.grouped'

/** Bare `/programmer` → the current project's programmer. Mirrors `ShowRedirect`. */
export function ProgrammerRedirect() {
  return <CurrentProjectRedirect to="programmer" />
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
 * string is carried across because `?cue=` deep links are how the Prompt Book's "Edit cue"
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
  // `frameRateProgress: false` — this page mounts the hook only for the bar's props and never
  // reads the transport, so without it a running fade re-renders the whole page (and everything
  // under `ProgrammerBody`) per rAF, exactly while channel frames are also landing. The bar's
  // FADING countdown is unaffected: it animates itself from the write-once `fade` descriptor.
  const { showBarProps, showHeaderProps } = useShowBarProps(projectIdNum, {
    frameRateProgress: false,
  })

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
        {/* Not gated on the show running — see the note in `ShowPage`. Blind lives in this bar
            now, and a programmer with no Blind before the show starts is the gap that gating it
            created. */}
        <ShowBar {...showBarProps} />
        <ProgrammerBody projectId={projectIdNum} />
      </div>
    </ProgrammerSheetsProvider>
  )
}

/**
 * Split from `ProgrammerPage` only so it sits *inside* `ProgrammerSheetsProvider` and can call
 * `useProgrammerSheets`.
 *
 * Memoized: its only prop is `projectId`, so this is the barrier that keeps `ProgrammerPage`'s own
 * re-renders (`useShowBarProps`, `useCurrentProjectQuery`, `useProjectQuery`) from cascading into
 * the whole grid/rail/scope subtree below it.
 */
const ProgrammerBody = memo(function ProgrammerBody({ projectId }: { projectId: number }) {
  const sheets = useProgrammerSheets()
  const { includeCue } = useInclude(projectId)
  // Grouping is a toggle rather than a route split: busking a whole wash wants group rows, plotting
  // an individual mover wants the flat list, and both are the same grid.
  const [grouped, setGrouped] = usePersistentState<boolean>(GROUPED_KEY, false)
  // Owned here rather than inside the grid because the menu renders in the action bar, which is a
  // full-width band above the workspace the grid sits in.
  const [columnVisibility, setColumnVisibility] = useColumnVisibility()

  // Revert is drop-everything-then-re-Include. There is no server-side revert, and those two steps
  // in that order are what the operator means: throw away the busk, load the cue again.
  //
  // The include target is read at click time rather than subscribed via
  // `useProgrammerSummaryQuery`: this component is the memo barrier for the whole grid/rail
  // subtree, and a summary subscription held *here* re-rendered all of it on every Include,
  // Record, blind flip or entry-count move — a wake `memo` cannot block, since it only
  // compares props. Read before `programmerClearAll`, which is about to clear the target.
  const handleRevert = () => {
    const cueId = includedCueId(lightingApi.programmer.getState().lastIncluded)
    programmerClearAll(0)
    if (cueId != null) void includeCue(cueId)
  }

  return (
    <ProgrammerScopeProvider>
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

      {/* The outer editor context stays `live` for the *rail* — its FX controls write the
          programmer whatever the grid is pointed at. `ProgrammerGrid` provides its own inner
          context derived from the scope. */}
      {/* Above the workspace, not inside the grid: the rail's own layer chrome reads the same
          store, and one fetch per focused layer is the point of it living here. The **scope band is
          inside it too**, and must stay there: it reads `useLookSaveState()`, which outside the
          provider silently answers the context default — so "Unsaved", "Saving…" and, worst of the
          three, "Save failed" could never appear. */}
      <LookRowStoreProvider projectId={projectId}>
        {/* Session 2's scope band. The template strip is still to come (session 3). */}
        <ProgrammerScopeBand />

        <EditorContextProvider value={{ kind: 'live' }}>
          <ProgrammerWorkspace
            grid={
              <ProgrammerGrid
                projectId={projectId}
                grouped={grouped}
                columnVisibility={columnVisibility}
                onColumnVisibilityChange={setColumnVisibility}
              />
            }
            rail={<ProgrammerRail />}
          />
        </EditorContextProvider>
      </LookRowStoreProvider>
    </ProgrammerScopeProvider>
  )
})

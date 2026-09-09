import { memo } from 'react'
import { Loader2 } from 'lucide-react'
import { Navigate, useParams } from 'react-router'
import { Card } from '@/components/ui/card'
import { ShowBar } from '@/components/ShowBar'
import { ShowHeader } from '@/components/ShowHeader'
import { EditorContextProvider } from '@/components/programmer/EditorContext'
import { ProgrammerActionBar } from '@/components/programmer/ProgrammerActionBar'
import { useColumnVisibility } from '@/components/fixtures-list/ColumnsMenu'
import { ProgrammerGrid } from '@/components/programmer/ProgrammerGrid'
import { LookRowStoreProvider } from '@/components/programmer/LookRowStore'
import { FocusedTemplateLayerProvider } from '@/components/programmer/FocusedTemplateLayer'
import { ProgrammerRail } from '@/components/programmer/ProgrammerRail'
import { ProgrammerScopeProvider } from '@/components/programmer/ProgrammerScope'
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
 * The programmer, as a place.
 *
 * It was a page, then three tabs — Values / Layers / FX — of a pane collapsed inside the Show view,
 * and is a page again. The tabs were the problem: they are three readings of *one live object*, so
 * putting them behind a switcher meant the operator could never watch the layer stack that produced
 * the values they were editing. Everything is on screen at once here, which is the entire point.
 *
 * **Two rows of chrome, not six bands.** It shipped as six deliberately separate siblings — source
 * strip, action bar, scope band, filter row, template strip, column header — each designed on its
 * own, each spending a line on a label or a sentence, and together 489px of a 900px screen before
 * the first fixture. The space plan's session 1 folds them: **row A** is the noun and the verbs
 * (the source box on the left, Clear / Include / Record on the right, one 40px line), and **row B**
 * is what the grid shows (scope, filter, Lit, Groups, Columns) — which lives *inside*
 * `ProgrammerGrid`'s toolbar, because it describes the grid and has no business spanning the rail.
 * Nothing the labels and sentences said was deleted; every one of them is a `title` or an
 * `aria-label` now, and each component's doc comment says which.
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
  // Owned here rather than inside the grid, and it must stay here: this component is the memo
  // barrier, and state held above it in `ProgrammerPage` would put every ShowBar re-render through
  // the whole grid/rail subtree. The *controls* render on row B, inside the grid's own toolbar.
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
      {/* Row A: the noun and the verbs, on one 40px line. It declares the `@container` both
          halves query — neither may declare its own, or each would measure itself instead of the
          width it has to share (see `ProgrammerWorkspace`'s doc comment for that bug). */}
      <div className="@container shrink-0 border-b bg-card/50 px-3">
        <div className="flex h-10 items-center gap-2">
          <ProgrammerSourceStrip
            projectId={projectId}
            onUpdate={sheets.openUpdate}
            onRevert={handleRevert}
            onRecord={() => sheets.openRecord()}
          />
          <span className="h-[22px] w-px shrink-0 self-center bg-border" />
          <ProgrammerActionBar projectId={projectId} />
        </div>
      </div>

      {/* The outer editor context stays `live` for the *rail* — its FX controls write the
          programmer whatever the grid is pointed at. `ProgrammerGrid` provides its own inner
          context derived from the scope. */}
      {/* Above the workspace, not inside the grid: the rail's own layer chrome reads the same
          store, and one fetch per focused layer is the point of it living here. The **scope band is
          inside it too**, and must stay there: it reads `useLookSaveState()`, which outside the
          provider silently answers the context default — so "Unsaved", "Saving…" and, worst of the
          three, "Save failed" could never appear. */}
      {/* Its template sibling, for the same reason and at the same height: a focused *template*
          layer has no `LookRowStore` (that one owns a row draft and engages only for a LOOK), and
          the grid, the notices and the scope band all need to know what it holds. */}
      <LookRowStoreProvider projectId={projectId}>
        <FocusedTemplateLayerProvider projectId={projectId}>
          <EditorContextProvider value={{ kind: 'live' }}>
            <ProgrammerWorkspace
              grid={
                <ProgrammerGrid
                  projectId={projectId}
                  grouped={grouped}
                  onGroupedChange={setGrouped}
                  columnVisibility={columnVisibility}
                  onColumnVisibilityChange={setColumnVisibility}
                />
              }
              rail={<ProgrammerRail />}
            />
          </EditorContextProvider>
        </FocusedTemplateLayerProvider>
      </LookRowStoreProvider>
    </ProgrammerScopeProvider>
  )
})

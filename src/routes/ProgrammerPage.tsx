import { memo } from 'react'
import { Loader2 } from 'lucide-react'
import { Navigate, useParams } from 'react-router'
import { Card } from '@/components/ui/card'
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
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { usePersistentState } from '@/hooks/usePersistentState'
import { useShowBarProps } from '@/hooks/useShowBarProps'
import { lightingApi } from '@/api/lightingApi'
import { includedCueId } from '@/lib/includedTarget'
import { programmerClearAll } from '@/store/programmer'
import { useCurrentProjectQuery, useProjectQuery } from '@/store/projects'
import { CurrentProjectRedirect } from '@/components/CurrentProjectRedirect'

const GROUPED_KEY = 'programmer.grouped'

/**
 * The short-height arm's threshold (space plan D8). A landscape phone is ~393px tall, and an app
 * header, a `ShowHeader` and two rows of chrome leave it four fixture rows and part of a fifth;
 * 500 is the artboard's number and the one `Layout` and `ShowHeader` unstick and tighten
 * themselves at, so the three surfaces fold together rather than at three nearby numbers.
 *
 * That count was three until this page stopped drawing a `ShowBar` (see the note beside the
 * header below) — the band was ~60px of the same 393.
 */
const SHORT_VIEWPORT = '(max-height: 500px)'

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
 * **One header and two rows of chrome, not a header, a show bar and six bands.** It shipped as six
 * deliberately separate siblings — source strip, action bar, scope band, filter row, template
 * strip, column header — each designed on its own, each spending a line on a label or a sentence,
 * and together 489px of a 900px screen before the first fixture, under 115px of `ShowHeader` and
 * `ShowBar` besides. The space plan's session 1 folds the six: **row A** is the noun and the verbs
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
  // Only `showHeaderProps` is read: this page draws no `ShowBar` (see the note beside the header
  // below). The hook is still the right source for the header's Start/Stop — the same derivation
  // the other three views get, and hand-rolling it here is the drift `useShowBarProps` exists to
  // prevent.
  //
  // `frameRateProgress: false` mattered when this page mounted the hook for a bar it no longer
  // draws, and matters more now that nothing here reads the transport at all: without it a running
  // fade re-renders the whole page (and everything under `ProgrammerBody`) per rAF, exactly while
  // channel frames are also landing.
  const { showHeaderProps } = useShowBarProps(projectIdNum, {
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
        {/* **No `ShowBar` here, and this is the only view without one.** The space plan's session 5
            asked whether `ShowHeader` should fold into the bar on all four live views; the answer
            taken at the desk was narrower and blunter — the *programmer* does not want the show
            chrome at all, and the other three keep both bands exactly as they were.

            The reasoning is the plan's own D1, applied to a band rather than to a row: everything
            above the grid earns its place by the line, and 60px of blackout, tempo, cue numbers
            and a transport is the largest thing on this page that is not about editing values. It
            is not lost, it is one pill away — the switcher in the header above reaches Show, the
            Prompt Book and Busk, all three of which carry the full bar.

            What genuinely goes with it, so nobody rediscovers it as a bug:

             - **Blind is here, and blackout is gone outright.** Blind is *not* show chrome: it is
               a programmer fact — `ProgrammerSummary.blind`, written by `programmerSetBlind`, faded
               by the programmer's own fade — and the desk pass that followed session 5 found a
               programmer you could not go blind on unliveable (`PD-BLIND-ON-PROGRAMMER`). So the
               one Blind control in the app is the action bar's, in row A's Stage zone beside Clear
               and the fade, and the bar draws no tile for any host; the other three views *report*
               it through `ProgrammerIndicator`, as the app header does here. Session 5's note used
               to refuse exactly this as "a second Blind toggle" — it is not second, because
               `useShowBarProps` supplies none. What must not happen is the reverse drift: a Blind
               tile creeping back into the bar for one host, which would put one control in two
               places again. Blackout is a genuine absence; it was confirmed unimportant here.
             - **GO and BACK are not on this page**, and the programmer binds no transport keys —
               `useTransportKeys` is Show's and the Prompt Book's. Busking from the grid means
               keeping Show or Busk on screen, or a MIDI surface.
             - **The speed masters are not on this page.** `ProgrammerFxList`'s own rows name each
               effect's master, and `/speed-masters` manages the bank. */}
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
  // barrier, and state held above it in `ProgrammerPage` would put every re-render of the chrome
  // above — `ShowHeader`, and the `useShowBarProps` call feeding it — through the whole grid/rail
  // subtree. That used to read "every ShowBar re-render", which was the loudest source of them
  // until this page stopped drawing one; the barrier is no less load-bearing for it, since the
  // hook still runs here and still moves on every cue change. The *controls* render on row B,
  // inside the grid's own toolbar.
  const [columnVisibility, setColumnVisibility] = useColumnVisibility()
  // Short-height mode (space plan D8): under 500px of viewport height rows A and B are one row,
  // and row A's two halves are handed to the grid's toolbar as `leading` rather than drawn here.
  // A media query rather than a container query because HEIGHT is the question and a container
  // query cannot ask it; a hook here rather than CSS because the fold is a change of *place*, not
  // of appearance — and it is safe here specifically because this component is the memo barrier,
  // so the media change re-renders the subtree once and never the chrome above it. The
  // `ProgrammerWorkspace`/`ProgrammerGrid` elements keep their slots either way, so the grid
  // re-renders and never remounts — the rule `ProgrammerPage.test.tsx` gates on.
  const shortViewport = useMediaQuery(SHORT_VIEWPORT)

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

  // The two halves of row A, built once: drawn on their own row at an ordinary height, and handed
  // to row B as its leading block when the viewport is too short for two rows of chrome.
  const rowA = (
    <>
      <ProgrammerSourceStrip
        projectId={projectId}
        onUpdate={sheets.openUpdate}
        onRevert={handleRevert}
      />
      <span className="h-[22px] w-px shrink-0 self-center bg-border" />
      <ProgrammerActionBar projectId={projectId} />
    </>
  )

  return (
    <ProgrammerScopeProvider>
      {/* Row A: the noun and the verbs, on one 40px line. It declares the `@container` both
          halves query — neither may declare its own, or each would measure itself instead of the
          width it has to share (see `ProgrammerWorkspace`'s doc comment for that bug).

          Under 500px of viewport height it is not drawn at all: the same two components go into
          row B's leading slot, which is `ProgrammerGrid`'s `leading` prop, and the page's chrome
          is one line rather than two. `null` in that arm rather than a hidden div, because the
          components are mounted in the other place and two copies would be two of every query
          behind them. */}
      {!shortViewport && (
        <div className="@container shrink-0 border-b bg-card/50 px-3">
          <div className="flex h-10 items-center gap-2">{rowA}</div>
        </div>
      )}

      {/* The outer editor context stays `live` for the *rail* — its FX controls write the
          programmer whatever the grid is pointed at. `ProgrammerGrid` provides its own inner
          context derived from the scope. */}
      {/* The rail's width, collapsed flag and overlay flag are `ProgrammerWorkspace`'s, below
          this barrier — deliberately not state of this component or of `ProgrammerPage`, where a
          drag on the rail's handle would re-render the grid per pointer move. */}
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
                  leading={shortViewport ? rowA : null}
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

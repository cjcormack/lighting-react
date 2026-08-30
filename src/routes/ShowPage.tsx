import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Navigate, useSearchParams } from 'react-router'
import { Card } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import { useProjectCueStackListQuery } from '../store/cueStacks'
import { useCreateProjectCueMutation } from '../store/cues'
import { useProjectProgramStateQuery } from '../store/cueStacks'
import type { Cue } from '../api/cuesApi'
import { buildCueInput } from '../lib/cueUtils'
import { useShowBarProps } from '../hooks/useShowBarProps'
import { useEditLock } from '../hooks/useEditLock'
import { useCueExpansion } from '../hooks/useCueExpansion'
import { useTransportKeys } from '../hooks/useTransportKeys'
import { useNarrowContainer } from '../hooks/useNarrowContainer'
import { useProjectCueLocationsQuery, useProjectPromptBookQuery } from '../store/promptBooks'
import { positionLabelFor } from '../lib/promptBook/geometry'
import { StackTabStrip } from '../components/runner/StackTabStrip'
import { OffPlayheadBanner } from '../components/runner/OffPlayheadBanner'
import { RunMobile, type RunnerDisplayState } from '../components/runner/run/RunMobile'
import { ShowLockControl } from '../components/runner/ShowLockControl'
import { useGoToStackMutation, useDeactivateCueStackMutation } from '../store/cueStacks'
import { resetStack } from '../store/runnerSlice'
import { useDispatch } from 'react-redux'
import { ShowHeader } from '../components/ShowHeader'
import { ShowBar } from '../components/ShowBar'
import { ProgramView } from '../components/runner/program/ProgramView'
import { RecordSheet } from '../components/programmer/RecordSheet'
import { useInclude } from '../components/programmer/useInclude'
import type { CueStack } from '../api/cueStacksApi'

/** Below this container width the view becomes the phone runner, which is always locked. */
const MOBILE_RUNNER_THRESHOLD = 600

/** Stable no-op for the phone runner's requeue while it is reading a stack off the playhead. */
const NO_REQUEUE = () => {}

/** The cue's display name for the Record sheet's header, or undefined if it has vanished. */
function cueNameFor(stacks: CueStack[] | undefined, cueId: number): string | undefined {
  for (const stack of stacks ?? []) {
    const cue = stack.cues?.find((c) => c.id === cueId)
    if (cue) return cue.name
  }
  return undefined
}

export function ShowRedirect() {
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

/**
 * Back-compat for the removed FX Cues view. `/cues`, `/cues/all`, `/cues/standalone` →
 * `/show`; `/cues/stacks/:stackId` → `/show/stacks/:stackId`.
 */
export function CuesLegacyRedirect() {
  const { projectId, stackId } = useParams()
  const target = stackId
    ? `/projects/${projectId}/show/stacks/${stackId}`
    : `/projects/${projectId}/show`
  return <Navigate to={target} replace />
}

export function ShowPage() {
  const { projectId, stackId } = useParams()
  const projectIdNum = Number(projectId)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const { data: stacks, isLoading: stacksLoading, isFetching: stacksFetching } =
    useProjectCueStackListQuery(projectIdNum)
  const { data: programState } = useProjectProgramStateQuery(projectIdNum)

  const isShowActive = programState?.activeStackId != null
  const activeStackId = programState?.activeStackId ?? null
  const activeStack = useMemo(
    () => (activeStackId != null ? stacks?.find((s) => s.id === activeStackId) : undefined),
    [stacks, activeStackId],
  )

  // ── URL-derived navigation state ──
  // The drilled stack lives in the path (`/show/stacks/:stackId`); the inline-expanded cue is a
  // transient `?cue=` modifier. This mirrors how the (removed) FX Cues view derived its view from
  // the URL, and makes both deep-linkable / refresh-stable.
  const drillStackId = stackId ? Number(stackId) : null
  const drillStack = useMemo(
    () => (drillStackId != null ? stacks?.find((s) => s.id === drillStackId) : null),
    [stacks, drillStackId],
  )
  const cueParam = searchParams.get('cue')
  /** The cue the operator addressed. `?cue=` is an external contract — the Prompt Book mints it. */
  const openedCueId = cueParam ? Number(cueParam) : null

  /**
   * The show-editing lock, shared with the Prompt Book. This is what replaced `/run`: the two views
   * were never different destinations, only different answers to "can a stray click change the
   * show" — which is a mode, and one the Prompt Book already modelled well.
   *
   * `canEdit` comes off the playhead query rather than being assumed: the backend computes it as
   * "is this the current project", and a project that is not current cannot be edited at all.
   *
   * Declared *above* the transport because the transport takes `noteGo` — see below.
   */
  const canEdit = programState?.canEdit ?? false
  const editLock = useEditLock({ canEdit, isShowActive })

  // Row 3 (show bar) — a functional transport here, without Run's keyboard shortcuts. Shown at every
  // width (it collapses responsively) whenever the show is running. Shared with the Programmer view,
  // which mounts the same bar from the same wiring.
  // Start/Stop comes from the same hook as the bar rather than being re-derived here: it was the
  // same three lines off the same state, and a second copy is a copy that drifts.
  // `onBeforeGo: noteGo` is what makes GO end a fix-it session, on this surface as well as on the
  // Prompt Book — the two share one lock, so they have to agree about what GO does to it.
  // `frameRateProgress: false` — the desktop rows read their own fade via `ProgramView`'s
  // `fadeStackId`, and the phone runner's Current card and cue-list sheet now do the same, so
  // this page never reads `transport.fadeProgress`/`fadeRemainMs`/`autoProgress`. The bar's
  // FADING badge is unaffected: it animates from the write-once `fade` descriptor.
  const { showBarProps, showHeaderProps, transport, nextStack, activeCue, standbyCue } =
    useShowBarProps(projectIdNum, { onBeforeGo: editLock.noteGo, frameRateProgress: false })
  const runnableStackCount = stacks?.filter((s) => s.type === 'STACK').length ?? 0

  // The phone layout is always locked, whatever the lock says — it is a running surface with no
  // room for the editing chrome, so there is nothing there for an unlocked state to reveal.
  const [bodyRef, isNarrow] = useNarrowContainer(MOBILE_RUNNER_THRESHOLD)
  const locked = editLock.locked || isNarrow
  /**
   * A *running* show that is unlocked — the state the chrome shouts about.
   *
   * Not the same as `!locked`: a stopped show is unlocked too, and there is nothing to be wrong
   * about there. Threaded to every bar of chrome rather than applied once at the top, because the
   * band is made of siblings — header, show bar, tab strip, navigation row — and tinting only some
   * of them reads as stripes rather than as one state.
   */
  const unlockedWarning = !locked && isShowActive

  /**
   * What the phone runner is showing, and whether that is the playhead.
   *
   * The phone falls back to the live stack when nothing is drilled, so "off the playhead" is a
   * question about the stack actually on screen rather than about `drillStackId`.
   */
  const phoneStack = drillStack ?? activeStack
  const phoneOffPlayhead = phoneStack != null && phoneStack.id !== activeStackId

  /**
   * Space/Backspace act only while locked. Unlocked means the operator is editing — inline cue
   * numbers, names and fades are all live text fields — and in an editing surface Space is a space.
   * `L` stays bound in both states, so there is always a keyboard way back to a safe desk.
   */
  useTransportKeys({
    enabled: locked && !showBarProps.goDisabled,
    onGo: transport.go,
    onBack: transport.back,
    onToggleLock: editLock.toggleLock,
  })

  // Per-cue prompt-book reading position ("top of p. 9"). Empty when the project has no book, in
  // which case the label simply doesn't render.
  const { data: cueLocations } = useProjectCueLocationsQuery(projectIdNum)
  const { data: promptBook } = useProjectPromptBookQuery(projectIdNum)
  const coverPages = promptBook?.coverPages ?? 0
  const locationByCue = useMemo(() => {
    const m = new Map<number, string>()
    for (const l of cueLocations ?? []) m.set(l.cueId, positionLabelFor(l.page, l.y, coverPages))
    return m
  }, [cueLocations, coverPages])

  /**
   * Arm a cue as the next GO.
   *
   * Depends on `transport.setStandby` rather than on `transport`: the transport hook returns a fresh
   * object literal every render, so taking the whole thing as a dependency gives this callback a new
   * identity on every fade frame — which defeats `ProgramView`'s memo, the one thing standing between
   * a fade and several hundred cue rows reconciling at frame rate.
   */
  const { setStandby } = transport
  const handleSetStandby = useCallback((cueId: number) => setStandby(cueId), [setStandby])

  const runnerDisplay: RunnerDisplayState = {
    activeCue,
    standbyCue,
    nextStack,
    activeCueId: transport.activeCueId,
    standbyCueId: transport.standbyCueId,
    completedCueIds: transport.completedCueIds,
  }

  const dispatch = useDispatch()
  const [goToStack] = useGoToStackMutation()
  const [deactivateCueStack] = useDeactivateCueStackMutation()

  const handleSelectStack = useCallback(
    (target: CueStack) => {
      if (target.type !== 'STACK') return
      navigate(`/projects/${projectIdNum}/show/stacks/${target.id}`)
    },
    [navigate, projectIdNum],
  )

  /**
   * Move the playhead to the stack being read.
   *
   * Until session 2b this was what a tab click did silently, which meant one unconfirmed press took
   * the live cue off stage and repositioned every other client. Three things to know:
   *
   *  - **No client-side deactivate of the stack being left.** `POST /show/go-to` already calls
   *    `deactivateStack(previous)` server-side (`routes/projectShow.kt`).
   *  - **`go-to` fires the target's first cue** (`activateAtFirstCue`), so the desk darkens it again
   *    to arrive armed rather than playing — a real, brief blip, which is why `OffPlayheadBanner`
   *    confirms first when something is live.
   *  - **The runner is reset explicitly.** Between `go-to` resolving and the deactivate landing the
   *    server reports the freshly-activated first cue, and a reset reading that would mark cue 1 as
   *    already run.
   */
  const handleMakeLive = useCallback(
    (target: CueStack) => {
      if (target.type !== 'STACK' || target.id === activeStackId) return
      transport.cancelAnimations()
      goToStack({ projectId: projectIdNum, stackId: target.id })
        .unwrap()
        .then(() => {
          deactivateCueStack({ projectId: projectIdNum, stackId: target.id })
          dispatch(
            resetStack({
              stackId: target.id,
              cues: target.cues,
              serverActiveCueId: null,
              serverNextCueId: null,
              loop: target.loop,
            }),
          )
        })
        .catch(() => {
          // Reported by errorToastMiddleware; caught here only to stop the unhandled rejection.
        })
    },
    [activeStackId, projectIdNum, transport, goToStack, deactivateCueStack, dispatch],
  )

  const [createCue] = useCreateProjectCueMutation()

  // Record replaces the old "Grab live state" button. Grab-live is still reachable — it is
  // `source: 'STAGE_SNAPSHOT'` in the Record sheet — but it is no longer the only way to get
  // the stage into a cue, and it was the lossy one.
  const { includeCue, isLoading: includePending } = useInclude(projectIdNum)
  const [recordCueId, setRecordCueId] = useState<number | null>(null)
  /**
   * Record into a *new* cue in this stack — what replaced "Add Cue".
   *
   * A separate piece of state from `recordCueId` rather than a union, because the two name ids from
   * different tables: a cue id and a stack id collide freely, and `RecordSheet` keys its draft on
   * which one it was given. Folding them together is exactly the bug `ProgrammerSheets` documents.
   */
  const [recordStackId, setRecordStackId] = useState<number | null>(null)

  // Set/clear the `?cue=` modifier without touching the stack path (replace: no history spam).
  const setExpandedCueId = useCallback(
    (cueId: number | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (cueId == null) next.delete('cue')
          else next.set('cue', String(cueId))
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  /**
   * Two cards are open at most: the one addressed by `?cue=`, and the one on stage — the latter
   * derived rather than stored, so a GO cannot take away the card the operator opened. Session 2b
   * replaced an auto-expand effect that *wrote* `?cue=` on drill, which conflated "what is live"
   * with "what I am reading" in one slot and let a GO overwrite the second with the first.
   */
  const { isExpanded, toggleExpanded } = useCueExpansion({
    openCueId: openedCueId,
    // The memoised setter, not an inline arrow: an arrow would be a fresh identity every render,
    // which would give `toggleExpanded` one too and break `ProgramView`'s memo mid-fade.
    setOpenCueId: setExpandedCueId,
    liveCueId: drillStackId === activeStackId ? (activeStack?.activeCueId ?? null) : null,
    resetKey: drillStackId,
  })

  const handleDrillStack = useCallback(
    (id: number | null) => {
      if (id == null) navigate(`/projects/${projectIdNum}/show`)
      else navigate(`/projects/${projectIdNum}/show/stacks/${id}`)
    },
    [navigate, projectIdNum],
  )

  const handleBreadcrumbCurrentPageClick = useCallback(() => {
    navigate(`/projects/${projectIdNum}/show`)
  }, [navigate, projectIdNum])

  const initialDrillDoneRef = useRef(false)

  const handleDuplicate = useCallback(
    async (cue: Cue) => {
      if (drillStackId == null) return
      try {
        const input = buildCueInput(cue)
        input.name = cue.name + ' (copy)'
        input.cueNumber = null
        input.cueStackId = drillStackId
        const result = await createCue({ projectId: projectIdNum, ...input }).unwrap()
        setExpandedCueId(result.id)
      } catch {
        // Reported by errorToastMiddleware; caught here only to stop the unhandled rejection.
      }
    },
    [drillStackId, projectIdNum, createCue, setExpandedCueId],
  )

  const handleRecordInto = useCallback((cueId: number) => setRecordCueId(cueId), [])

  const handleRecordIntoStack = useCallback((stackId: number) => setRecordStackId(stackId), [])

  const handleIncludeCue = useCallback((cueId: number) => void includeCue(cueId), [includeCue])

  // ── Deep-link normalizer + auto-drill ──
  // - Legacy `/show?stack=X&cue=Y` links (the Prompt Book's "Edit cue" mints the path form now)
  //   are rewritten to
  //   the new path scheme `/show/stacks/X?cue=Y`.
  // - Otherwise, when the show is running, drill into the active stack on first mount so the
  //   operator lands where the action is.
  useEffect(() => {
    if (initialDrillDoneRef.current) return
    if (!stacks) return

    const legacyStack = searchParams.get('stack')
    if (legacyStack && drillStackId == null) {
      initialDrillDoneRef.current = true
      const sid = Number(legacyStack)
      if (Number.isFinite(sid) && stacks.some((s) => s.id === sid)) {
        const cue = searchParams.get('cue')
        navigate(
          `/projects/${projectIdNum}/show/stacks/${sid}${cue ? `?cue=${cue}` : ''}`,
          { replace: true },
        )
      } else {
        navigate(`/projects/${projectIdNum}/show`, { replace: true })
      }
      return
    }

    if (drillStackId == null && isShowActive && activeStackId != null) {
      initialDrillDoneRef.current = true
      navigate(`/projects/${projectIdNum}/show/stacks/${activeStackId}`, { replace: true })
    }
  }, [stacks, isShowActive, activeStackId, drillStackId, searchParams, navigate, projectIdNum])

  /**
   * Follow the playhead — but only while standing on it.
   *
   * A boundary GO moves the show into the next stack, and an operator who was watching it should go
   * too, or they are left reading the act that just finished. An operator who had deliberately
   * navigated elsewhere must *not* be yanked away mid-read, which is why this is conditional on the
   * drilled stack having been the old playhead.
   *
   * Deliberately a second effect rather than folded into the deep-link normalizer above. The plan
   * for this session proposed one rule with the first mount as its degenerate case; kept separate
   * because the normalizer also owns the legacy `?stack=` rewrite, which must run before any follow
   * navigation, and the two have genuinely different jobs: one lands you somewhere on arrival, this
   * one keeps you with the show afterwards.
   */
  const prevLiveStackRef = useRef<number | null | undefined>(undefined)
  useEffect(() => {
    if (!stacks) return
    const prevLive = prevLiveStackRef.current
    prevLiveStackRef.current = activeStackId
    // First resolution belongs to the normalizer above.
    if (prevLive === undefined || prevLive === activeStackId) return
    if (activeStackId == null || drillStackId !== prevLive) return
    navigate(`/projects/${projectIdNum}/show/stacks/${activeStackId}`, { replace: true })
  }, [stacks, activeStackId, drillStackId, navigate, projectIdNum])

  // Redirect away from a stale/unknown drilled stack (e.g. after deletion). Wait until the list has
  // settled — during the refetch that follows creating a stack, `stacks` briefly lacks the new
  // stack, and redirecting then would bounce the operator straight back out of it.
  useEffect(() => {
    if (
      drillStackId != null &&
      stacks &&
      !stacksFetching &&
      !stacks.some((s) => s.id === drillStackId)
    ) {
      navigate(`/projects/${projectIdNum}/show`, { replace: true })
    }
  }, [drillStackId, stacks, stacksFetching, navigate, projectIdNum])

  // Loading / redirect guards
  if (!currentLoading && currentProject && projectIdNum !== currentProject.id) {
    return <Navigate to={`/projects/${currentProject.id}/show`} replace />
  }

  if (projectLoading || currentLoading || stacksLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  if (!project) {
    return (
      <Card className="m-4 p-4">
        <p className="text-muted-foreground">Project not found</p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <ShowHeader
        view="show"
        projectId={projectIdNum}
        projectName={project.name}
        onCurrentPageClick={handleBreadcrumbCurrentPageClick}
        // Amber while a *running* show is unlocked — the state worth being unmistakable about,
        // matching the Prompt Book. A stopped show is simply editable, so there is nothing to warn
        // about and no wash.
        unlockedWarning={unlockedWarning}
        // The slot was left in place for "session 2b's merged view", which is this. The lock is the
        // one control that belongs beside the view switcher rather than in the page: it changes what
        // the whole view will accept.
        // Not shown at all where the backend would refuse the edit — unlike the Prompt Book, which
        // shows it inert. Offering an unlock that can only 4xx is worse than offering none, and
        // `ShowPage.test.tsx` pins it; `ShowLockControl`'s docblock describes the Prompt Book's arm.
        actions={
          editLock.lockRelevant && !isNarrow ? (
            <ShowLockControl
              locked={editLock.locked}
              onToggle={editLock.toggleLock}
              countdownSecondsLeft={editLock.countdownSecondsLeft}
              onStayUnlocked={editLock.stayUnlocked}
            />
          ) : undefined
        }
        {...showHeaderProps}
      />

      {/* Not gated on the show running. The bar carries blackout, Blind, the speed masters and the
          programmer chip, all of which mean something with the show down — and gating it was what
          made Blind's location depend on the show's state. `goDisabled` already mutes BACK/GO.
          Still hidden on the phone, where `RunMobile` brings its own transport footer. */}
      {!isNarrow && (
        <ShowBar
          {...showBarProps}
          // The one prop that legitimately differs per view: it advertises keys, and only the host
          // binding them can say whether they act. Show binds them while locked; the Programmer
          // does not bind them at all. Everything else about the bar is identical everywhere,
          // deliberately — it is the same chrome, so it should not read as three near-copies.
          showShortcuts={locked}
          unlockedWarning={unlockedWarning}
        />
      )}

      {isNarrow ? (
        <div ref={bodyRef} className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* The phone has no tab strip, so without this the picker could leave the operator
              reading a stack GO does not act on with nothing whatsoever saying so — and no way to
              arm it, since the strip's old click-to-move-the-playhead is gone. */}
          {phoneStack && phoneOffPlayhead && (
            <OffPlayheadBanner
              liveStackName={activeStack?.name ?? null}
              selectedStackName={phoneStack.name}
              liveCueIsOnStage={activeStack?.activeCueId != null}
              onJumpToLive={() =>
                activeStackId != null &&
                navigate(`/projects/${projectIdNum}/show/stacks/${activeStackId}`)
              }
              onMakeLive={() => handleMakeLive(phoneStack)}
            />
          )}
          <RunMobile
            stacks={stacks ?? []}
            selectedStackId={drillStackId ?? activeStackId}
            stack={phoneStack}
            multiStack={runnableStackCount > 1}
            display={runnerDisplay}
            dbo={showBarProps.dbo}
            onGo={transport.go}
            onBack={transport.back}
            onDbo={showBarProps.onDbo}
            onSelectStack={handleSelectStack}
            // Inert off the playhead, for the reason the desktop rows are: `setStandby` arms the
            // *playhead's* stack, so a tap here would arm a cue that is not in it.
            onRequeueCue={phoneOffPlayhead ? NO_REQUEUE : handleSetStandby}
            projectId={projectIdNum}
            fadeStackId={activeStackId}
            activeLocation={activeCue ? locationByCue.get(activeCue.id) ?? null : null}
            standbyLocation={standbyCue ? locationByCue.get(standbyCue.id) ?? null : null}
          />
        </div>
      ) : (
        /* `noteEdit` on any interaction with the unlocked body is what keeps the idle re-lock from
           firing at an operator who is mid-edit — the editing here lives in a dozen handlers spread
           across the overview, the stack detail and the rows, so it is caught once at the boundary
           rather than threaded through every one of them. A no-op while locked (and while the show
           is stopped), so it costs nothing in the normal running state. */
        <div
          ref={bodyRef}
          className="flex-1 flex min-h-0"
          onPointerDownCapture={editLock.noteEdit}
          onKeyDownCapture={editLock.noteEdit}
        >
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            {/* The stack switcher, and the banner that exists because selecting a tab no longer
                moves the playhead. Both belong to the drill-down: the stack *list* is its own
                switcher, so neither has anything to say there. */}
            {drillStackId != null && (
              <StackTabStrip
                stacks={stacks ?? []}
                selectedStackId={drillStackId}
                liveStackId={activeStackId}
                runnableStackCount={runnableStackCount}
                onSelectStack={handleSelectStack}
                unlockedWarning={unlockedWarning}
              />
            )}
            {drillStack && drillStackId !== activeStackId && (
              <OffPlayheadBanner
                liveStackName={activeStack?.name ?? null}
                selectedStackName={drillStack.name}
                liveCueIsOnStage={activeStack?.activeCueId != null}
                onJumpToLive={() =>
                  activeStackId != null &&
                  navigate(`/projects/${projectIdNum}/show/stacks/${activeStackId}`)
                }
                onMakeLive={() => handleMakeLive(drillStack)}
              />
            )}
            <ProgramView
              projectId={projectIdNum}
              stacks={stacks ?? []}
              drillStackId={drillStackId}
              onDrillStack={handleDrillStack}
              activeStackId={activeStackId}
              // Server-tracked activeCueId reflects what's on stage, not the
              // transient fade cursor — so the marker stays stable during fades.
              activeCueId={activeStack?.activeCueId ?? null}
              standbyCueId={transport.standbyCueId}
              fadeStackId={activeStackId}
              completedCueIds={transport.completedCueIds}
              locationByCue={locationByCue}
              onSetStandby={handleSetStandby}
              locked={locked}
              unlockedWarning={unlockedWarning}
              isExpanded={isExpanded}
              onToggleExpanded={toggleExpanded}
              openedCueId={openedCueId}
              onDuplicate={handleDuplicate}
              onRecordInto={handleRecordInto}
              onRecordIntoStack={handleRecordIntoStack}
              onIncludeCue={handleIncludeCue}
              includePending={includePending}
            />
          </div>
        </div>
      )}

      {recordCueId != null && (
        <RecordSheet
          open
          onOpenChange={(open) => !open && setRecordCueId(null)}
          projectId={projectIdNum}
          targetCueId={recordCueId}
          targetCueName={cueNameFor(stacks, recordCueId)}
        />
      )}
      {recordStackId != null && (
        <RecordSheet
          open
          onOpenChange={(open) => !open && setRecordStackId(null)}
          projectId={projectIdNum}
          defaultCueStackId={recordStackId}
        />
      )}
    </div>
  )
}

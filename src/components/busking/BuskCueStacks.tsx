import { useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AUTO_CUE_NUMBER_CLASS } from '@/lib/cueNumber'
import { BuskLabel } from './BuskLabel'
import { ignoreReportedError } from '@/store/errorToastMiddleware'
import {
  useDeactivateCueStackMutation,
  useGoToStackMutation,
  useProjectCueStackListQuery,
} from '@/store/cueStacks'
import type { CueStack, CueStackCueEntry } from '@/api/cueStacksApi'
import type { ShowTransport } from '@/hooks/useShowTransport'

/**
 * The column's own root classes.
 *
 * `@container` because this column is a *grid track* beside the Looks pool, not a full-width band:
 * without it the pinned-pad grid below reads the whole pad scroller's width and packs four columns
 * into the three fifths of it this track actually got. `min-w-0` because a grid item's default
 * `min-width: auto` lets a long stack name widen the track past its share.
 */
const COLUMN_ROOT = '@container min-w-0 mt-3'

/**
 * The busk view's cue column: one card per runnable stack, then the pinned cues as pads.
 *
 * **Pressing anything here moves the playhead, with no arming confirm** — the plan's D9. That is a
 * deliberate contrast with `/show`, whose confirm-gated arming exists because *browsing* a stack
 * must not fire cues. There is no browsing here: every control on this page exists to be pressed,
 * a pinned pad names exactly what it fires, and the operator chose to stand at a performance
 * surface. The show-editing lock is not consulted either — busking is the live use, and the lock
 * is a stray-click guard for editing surfaces rather than a transport gate.
 *
 * **Every run cursor comes from the transport passed in**, never from a copy kept here.
 * `serverActiveCueId` places the "on stage" pip and lights a pad; `standbyCueId` is what the state
 * line calls next. Holding either locally would be the second cache copy of a run cursor the
 * standing rule forbids, and the two would disagree mid-fade.
 *
 * The stack list is read here rather than drilled down as a prop. That is not a second copy: it is
 * the *same* RTK Query cache entry `useShowBarProps` subscribes to, deduplicated by key, so the
 * cards and the ShowBar above them cannot show different rows. Only the transport is passed in —
 * that one really must be a single instance per page.
 */
export function BuskCueStacks({
  projectId,
  transport,
}: {
  projectId: number
  transport: ShowTransport
}) {
  const { data: stacks } = useProjectCueStackListQuery(projectId)
  const liveStackId = transport.activeStackId
  const [goToStack] = useGoToStackMutation()
  const [deactivateStack] = useDeactivateCueStackMutation()

  // Separators are label-only rows: nothing to activate, nothing to release.
  const runnable = useMemo(() => (stacks ?? []).filter((s) => s.type === 'STACK'), [stacks])

  /**
   * Every pinned cue in the show, in show order then stack order.
   *
   * Read off the stack list rather than `/cues`, so a pad and its card share one cache — see the
   * field's own note on `CueStackCueEntry`. A MARKER is dropped: `goToCue` refuses one server-side,
   * so a pad for it could only ever fail.
   */
  const pinned = useMemo(
    () =>
      runnable.flatMap((stack) =>
        stack.cues
          .filter((c) => c.pinnedToBusk && c.cueType !== 'MARKER')
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((cue) => ({ cue, stack })),
      ),
    [runnable],
  )

  const fireCue = useCallback(
    (stackId: number, cueId: number) => {
      // One request, not go-to-then-activate: the two-call form fires the stack's first cue on the
      // way past, which is a visible blip on a live rig. `/show/go-to` takes the cue itself.
      goToStack({ projectId, stackId, cueId }).unwrap().catch(ignoreReportedError)
    },
    [goToStack, projectId],
  )

  // Nothing is claimed while the list is still loading. "This project has no cue stacks yet" is a
  // statement about the show, and an empty cache would have it said about every project for a beat
  // — the heading alone holds the column's width in the meantime.
  if (stacks == null) {
    return (
      <div className={COLUMN_ROOT}>
        <BuskLabel>Cue stacks</BuskLabel>
      </div>
    )
  }

  if (runnable.length === 0) {
    return (
      <div className={COLUMN_ROOT}>
        <BuskLabel>Cue stacks</BuskLabel>
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          This project has no cue stacks yet. Build the show on the Show view.
        </p>
      </div>
    )
  }

  return (
    <div className={cn(COLUMN_ROOT, 'flex flex-col gap-2')}>
      <BuskLabel>Cue stacks</BuskLabel>

      {runnable.map((stack) => (
        <StackCard
          key={stack.id}
          stack={stack}
          // Running, not merely holding the playhead — the two come apart, and only after a press
          // on this card. `deactivateStack` stops a stack without clearing `project.activeStackId`,
          // so a Release leaves the playhead here with nothing on stage; keying off the playhead
          // alone drew the live pip beside "Inactive — GO fires …" and sent GO to the transport,
          // which would have crossed into the next stack rather than firing the cue just named.
          isLive={stack.id === liveStackId && stack.activeCueId != null}
          transport={transport}
          onGo={() => {
            if (stack.id === liveStackId && stack.activeCueId != null) {
              // A running live stack advances through the shared transport, so a GO here and a GO
              // in the ShowBar are the same press — optimistic cursor and stack boundary included.
              transport.go()
            } else {
              // Everything else is a playhead move, which is what the card's own label promises:
              // a stack that is not live, and a live one that has been released.
              goToStack({ projectId, stackId: stack.id }).unwrap().catch(ignoreReportedError)
            }
          }}
          onRelease={() => {
            deactivateStack({ projectId, stackId: stack.id }).unwrap().catch(ignoreReportedError)
          }}
        />
      ))}

      <BuskLabel className="mt-1">Pinned cues</BuskLabel>
      {pinned.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          No cues pinned yet. Pin one from its properties on the Show view to give it a pad here.
        </p>
      ) : (
        <div className="grid grid-cols-2 @[28rem]:grid-cols-3 @[48rem]:grid-cols-4 gap-2">
          {pinned.map(({ cue, stack }) => (
            <PinnedCuePad
              key={cue.id}
              cue={cue}
              stackName={stack.name}
              // The stable "on stage" cursor, not the optimistic one: a pad is a destination, and
              // it should light when the cue is actually up rather than the instant a fade starts.
              isLive={stack.id === liveStackId && cue.id === transport.serverActiveCueId}
              onPress={() => fireCue(stack.id, cue.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * One stack: what it is doing, Release, and GO.
 *
 * GO means two different requests and one gesture. On the live stack it is the shared transport's
 * advance — the same press as the ShowBar's, so the optimistic cursor and the cross-stack boundary
 * both behave as they do everywhere else. On an inactive stack it is a playhead move, which is what
 * "GO fires cue 1" says: the stack being left is deactivated and this one starts.
 */
function StackCard({
  stack,
  isLive,
  transport,
  onGo,
  onRelease,
}: {
  stack: CueStack
  /** Holds the playhead **and** has a cue on stage — see the call site. */
  isLive: boolean
  transport: ShowTransport
  onGo: () => void
  onRelease: () => void
}) {
  const cueById = (id: number | null) => (id == null ? null : stack.cues.find((c) => c.id === id))
  // On the live stack the transport owns both cursors; on any other, only the server's own
  // `nextCueId` means anything — the runner slice tracks the playhead's stack alone.
  const current = cueById(isLive ? transport.serverActiveCueId : stack.activeCueId)
  const next = cueById(isLive ? transport.standbyCueId : stack.nextCueId)
  /**
   * What GO on an inactive stack will actually fire.
   *
   * `activateAtFirstCue` starts on the stack's **armed standby** when it has one and falls back to
   * the first standard cue, and `stack.nextCueId` is the server's own answer to exactly that
   * question. Naming the first cue unconditionally would mislabel every stack somebody has armed —
   * and the card would promise a cue the press does not fire. The positional walk stays as the
   * fallback for a row that arrived without run state, and doubles as the "is there anything to
   * fire at all" test: a stack of nothing but MARKERs has no standard cue, and `activateAtFirstCue`
   * throws on one rather than doing nothing.
   */
  const goTarget =
    cueById(stack.nextCueId) ?? stack.cues.find((c) => c.cueType !== 'MARKER') ?? null

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{stack.name}</span>
        <span className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
          {/* The same pip the ShowBar and the Prompt Book's anchors draw, from the one keyframe. */}
          {isLive && (
            <span
              className="size-2 shrink-0 rounded-full bg-green-500"
              style={{ animation: 'r-live-pulse 1.6s ease-in-out infinite' }}
              aria-label="live"
            />
          )}
          {current ? (
            <>
              <CueRef cue={current} />
              {next && (
                <>
                  <span aria-hidden>→</span>
                  <CueRef cue={next} />
                </>
              )}
            </>
          ) : goTarget ? (
            <>
              Inactive — GO fires <CueRef cue={goTarget} />
            </>
          ) : (
            'Empty'
          )}
        </span>
      </div>
      <Button
        variant="ghost"
        className="h-11 px-2.5 text-[11px]"
        onClick={onRelease}
        // Nothing to release on a stack that is not running. Disabled rather than hidden: the two
        // buttons keep their positions as stacks go live, so the operator's aim does not have to
        // follow the show.
        disabled={stack.activeCueId == null}
      >
        Release
      </Button>
      {/* No standard cue means nothing to fire — an empty stack, or one made only of MARKERs, which
          `activateAtFirstCue` refuses outright. A live stack always has one, so this never mutes
          the transport's own advance. */}
      <Button
        className="h-11 w-16 text-sm font-bold tracking-[0.06em]"
        onClick={onGo}
        disabled={goTarget == null}
      >
        GO
      </Button>
    </div>
  )
}

/** A cue's number and name, inline. Auto numbers render dimmed, as they do everywhere else. */
function CueRef({ cue }: { cue: CueStackCueEntry }) {
  return (
    <span className="truncate">
      {cue.cueNumber && (
        <span
          className={cn('font-mono tabular-nums', cue.cueNumberAuto && AUTO_CUE_NUMBER_CLASS)}
        >
          {cue.cueNumber}{' '}
        </span>
      )}
      {cue.name}
    </span>
  )
}

function PinnedCuePad({
  cue,
  stackName,
  isLive,
  onPress,
}: {
  cue: CueStackCueEntry
  stackName: string
  isLive: boolean
  onPress: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={isLive}
      title={`Fire ${cue.cueNumber ? `${cue.cueNumber} ` : ''}${cue.name} in ${stackName}`}
      className={cn(
        'flex min-h-[52px] flex-col items-start gap-0.5 rounded-lg border bg-card px-2.5 py-2 text-left transition-colors',
        'hover:bg-accent active:scale-[0.97]',
        isLive && 'border-green-500/70 bg-green-500/10 ring-1 ring-green-500/35',
      )}
    >
      <span
        className={cn(
          'font-mono text-[13px] font-bold tabular-nums',
          cue.cueNumberAuto && AUTO_CUE_NUMBER_CLASS,
        )}
      >
        {cue.cueNumber ?? '—'}
      </span>
      <span className="line-clamp-1 text-[11px] text-muted-foreground">{cue.name}</span>
      <span className="line-clamp-1 text-[9px] text-muted-foreground/70">{stackName}</span>
    </button>
  )
}

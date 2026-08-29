import { ArrowRight, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { UNLOCKED_WARNING_CLASS } from '@/lib/lockChrome'
import { ProgrammerIndicator } from './ProgrammerIndicator'
import { SpeedMasters } from './SpeedMasters'

interface ShowBarProps {
  /** Leading "current stack" segment. Rendered only when non-null — Run passes it only when
   *  the stack tabs are hidden (single stack); Program + Prompt Book always pass it. */
  stackName?: string | null
  dbo: boolean
  onDbo: () => void
  /** The cue currently outputting on stage. */
  activeNumber: string | null
  activeName: string | null
  /** The cue queued to fire on the next GO. */
  standbyNumber: string | null
  standbyName: string | null
  /** When the active cue is fading in, ms remaining (drives the amber FADING badge). */
  fadeRemainMs: number | null
  onGo: () => void
  onBack: () => void
  /** Disables + mutes BACK/GO (e.g. Prompt Book when the operator can't edit). Default false. */
  goDisabled?: boolean
  /**
   * The on-screen `space`/`⌫` keyboard hint. Default false.
   *
   * Only shown where those keys actually act: the merged Show view binds them while **locked** and
   * withholds them while unlocked, so the hint tracks the lock rather than the view.
   */
  showShortcuts?: boolean
  /**
   * Whether the programmer is gated out of the stage output.
   *
   * The tile appears only when `onBlind` is supplied, so a host that merely wants to *read* the
   * state uses `ProgrammerIndicator` instead. Do not make that indicator the toggle: it is also the
   * link to the programmer, and one control cannot be both without one of the two jobs becoming a
   * surprise.
   */
  blind?: boolean
  onBlind?: () => void
  /**
   * A running show is unlocked. Washes the bar amber to match the header above it — the chrome has
   * to tint as one band, or it reads as stripes.
   */
  unlockedWarning?: boolean
}

/**
 * Universal "show bar" (Row 3) shared across the live-show views:
 * BLACKOUT · speed masters · programmer · active → Next · BACK · GO.
 * GO is the largest, most prominent affordance. It reflects show state, not mode state, so it
 * renders identically in Programmer, Show, Run and Prompt Book.
 *
 * ## The rungs
 *
 * Collapse is driven by the bar's OWN width via container queries (`@container` + `@[NNpx]:` and
 * its exact complement `@max-[NNpx]:`), not the viewport — the app sidebar insets the content
 * region, so viewport width ≠ content width. Four rungs on three numbers:
 *
 * | Width      | Masters                        | Rows | GO                        |
 * |------------|--------------------------------|------|---------------------------|
 * | ≥1000      | a tile each, named*            | 1    | `min-w-[120px]`           |
 * | 700–1000   | one railed tile                | 1    | `min-w-[100px]`           |
 * | 440–700    | one railed tile, compact       | 2    | `flex-1`, h-10            |
 * | <440       | a chip + popover               | 2    | `flex-1`, h-[52px], 22px  |
 *
 * \* The masters column is the one thing here that is not purely a width decision: a tile each is
 * only affordable if the bank is small, so `SpeedMasters` raises its own threshold with the count
 * and falls back to the railed tile. See `TILED_ARM`.
 *
 * **The bar wraps rather than deleting.** It used to hide the live-state block below 560px, and
 * four *width-adding* rules fired at that same boundary in the other direction — so in the 560–900
 * band roughly 470px of `shrink-0` tiles left the `flex-1` live block nothing, and because every
 * child still visible inside it was itself `shrink-0` the cue numbers spilled out of its border.
 * Now nothing is gated on the bar being wide: the transport takes `basis-full` below 700 and drops
 * onto its own line, which is deterministic rather than hoping items wrap nicely, and the live
 * block cannot wrap at all because its `flex-1 basis-0` hypothetical size is zero. `overflow-hidden`
 * makes it clip rather than spill in the tightest band. Cue *numbers* stay `shrink-0` — a truncated
 * Q number is worse than a truncated name, so names go first.
 *
 * GO gets **wider** as the bar narrows, which is the right way round for a control pressed in the
 * dark: below 700 it is a `flex-1` item sharing a line with nothing but BACK.
 *
 * Two thresholds here are deliberately not rungs. `ProgrammerIndicator` queries `@[760px]`, which is
 * the *app header's* number (it is shared with `connection.tsx`); it lands mid-band here and that is
 * tolerated rather than re-owned for one caller's sake. And the kbd hint's `@[1100px]` asks a
 * different question in kind — "is there slack left over" rather than "which rung" — so folding it
 * into 1000 would put it in the band where the live block is tightest.
 */
export function ShowBar({
  stackName,
  dbo,
  onDbo,
  activeNumber,
  activeName,
  standbyNumber,
  standbyName,
  fadeRemainMs,
  onGo,
  onBack,
  goDisabled = false,
  showShortcuts = false,
  blind,
  onBlind,
  unlockedWarning = false,
}: ShowBarProps) {
  const isFading = fadeRemainMs != null && fadeRemainMs > 0

  return (
    <div
      className={cn(
        '@container flex flex-wrap items-stretch gap-1.5 border-b px-2.5 py-1.5 transition-colors @[440px]:gap-2 @[440px]:px-4 @[440px]:py-2',
        unlockedWarning && UNLOCKED_WARNING_CLASS,
      )}
    >
      {/* DBO tile. Tiles use `justify-start` (not `justify-center`) so the labels share the same
          y-baseline regardless of value font size. It steps its own chrome down the rungs rather
          than swapping to a second element. */}
      <button
        type="button"
        onClick={onDbo}
        aria-pressed={dbo}
        title="Toggle blackout"
        className={cn(
          'flex shrink-0 flex-col items-start justify-start gap-px rounded-md border px-2 py-1 transition-colors @[440px]:px-2.5 @[700px]:px-3 @[700px]:py-1.5',
          'bg-card hover:bg-muted/40',
          dbo && 'border-red-700 bg-red-950/40 hover:bg-red-950/50 shadow-[0_0_12px_rgba(239,68,68,0.25)]',
        )}
      >
        <span
          className={cn(
            'hidden text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground @[440px]:block',
            dbo && 'text-red-300',
          )}
        >
          Blackout
        </span>
        <span
          className={cn(
            'font-mono text-[11px] font-bold leading-none tracking-wider @[440px]:text-base @[700px]:text-lg',
            dbo ? 'text-red-300' : 'text-foreground',
          )}
        >
          DBO
        </span>
      </button>

      {/* Blind, beside blackout because they are the same class of thing: a gate on what reaches
          the rig. The tile is conditional on the prop, not on the host: every live view gets it,
          because they all take their props from `useShowBarProps`, which supplies `blind` and
          `onBlind` unconditionally. Host-conditional rendering is exactly the drift that hook
          exists to prevent — it used to put Blind in one place on the Programmer and another on
          Show. Do not reintroduce a per-host arm here.

          Note for whoever wires blackout up: DBO above is currently local state with no side
          effect, so these two look like peers while only one of them does anything. */}
      {onBlind && (
        <button
          type="button"
          onClick={onBlind}
          aria-pressed={blind ?? false}
          title={
            blind
              ? 'Blind is on — programmer values are gated out of the stage output'
              : 'Blind — edit without the rig showing it'
          }
          className={cn(
            'flex shrink-0 flex-col items-start justify-start gap-px rounded-md border px-2 py-1 transition-colors @[440px]:px-2.5 @[700px]:px-3 @[700px]:py-1.5',
            'bg-card hover:bg-muted/40',
            blind &&
              'border-amber-600 bg-amber-950/40 hover:bg-amber-950/50 shadow-[0_0_12px_rgba(245,158,11,0.25)]',
          )}
        >
          <span
            className={cn(
              'hidden text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground @[440px]:block',
              blind && 'text-amber-300',
            )}
          >
            Stage
          </span>
          <span
            className={cn(
              'font-mono text-[11px] font-bold leading-none tracking-wider @[440px]:text-base @[700px]:text-lg',
              blind ? 'text-amber-300' : 'text-foreground',
            )}
          >
            BLIND
          </span>
        </button>
      )}

      {/* Every speed master, master 1 included. Self-contained; picks its own arm from the width
          above. The ShowBar used to own an M1 readout beside this, which is the split that made the
          560px band unwinnable. */}
      <SpeedMasters />

      {/* Programmer tile — renders itself only when the programmer holds something or blind is
          engaged, so it costs no width during a clean show. It reads its own state, which is why it
          takes no props from here. It is a direct child rather than living in a wrapper div: a
          wrapper always rendered, and so always ate a gap, even when the indicator drew nothing. */}
      {/* `blindShownSeparately`: the BLIND tile above is this bar's blind signal, so the indicator
          reports only the value count here. Two amber badges saying the same word is worse than
          one. Conditional on the tile actually being drawn — a host that supplies no `onBlind` gets
          no tile, and hardcoding the flag would leave blind reported nowhere in this bar. */}
      <ProgrammerIndicator className="px-2.5 py-2" blindShownSeparately={onBlind != null} />

      {/* Live state — flexes to fill, and is never hidden. `overflow-hidden` is load-bearing: every
          child below is `shrink-0`, so without it they escape the border rather than clipping. */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-hidden rounded-md @[440px]:justify-start @[440px]:gap-2 @[440px]:border @[440px]:bg-card @[440px]:px-3 @[440px]:py-1.5 @[700px]:gap-3.5">
        {stackName && (
          <>
            <span className="hidden max-w-[160px] shrink-0 truncate text-sm font-medium @[700px]:block">
              {stackName}
            </span>
            <span className="hidden shrink-0 text-muted-foreground/40 @[700px]:block">·</span>
          </>
        )}
        {activeNumber || activeName ? (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="hidden size-[22px] shrink-0 place-items-center rounded-full border border-green-900 bg-green-950 text-green-400 @[440px]:grid"
                style={{ animation: 'r-live-pulse 1.6s ease-in-out infinite' }}
              >
                <Play className="size-2.5 fill-current" strokeWidth={0} />
              </span>
              {activeNumber && (
                <span className="shrink-0 font-mono text-sm font-bold text-green-400">
                  {activeNumber}
                </span>
              )}
              <span
                className={cn(
                  'hidden min-w-0 truncate text-sm @[700px]:block',
                  isFading ? 'font-medium text-amber-400' : 'font-medium text-foreground',
                )}
              >
                {activeName ?? 'No cue running'}
              </span>
              {isFading && (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-900 bg-amber-950/40 px-2 py-px font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-amber-400">
                  <span
                    className="size-1.5 rounded-full bg-amber-400"
                    style={{ animation: 'r-fade-pulse 0.9s ease-in-out infinite' }}
                  />
                  <span className="hidden @[700px]:inline">FADING · </span>
                  {(fadeRemainMs! / 1000).toFixed(1)}s
                </span>
              )}
            </div>

            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />

            <div className="flex min-w-0 items-center gap-2">
              <span className="hidden shrink-0 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground @[700px]:inline">
                Next
              </span>
              {standbyNumber && (
                <span className="shrink-0 font-mono text-xs font-bold text-blue-400">
                  {standbyNumber}
                </span>
              )}
              {/* The standby NAME is the last thing to arrive: at 700–1000 the active cue keeps its
                  name and this one does not, which is the mockup's rung 2. */}
              <span className="hidden truncate text-xs text-muted-foreground @[1000px]:inline">
                {standbyName ?? 'end of stack'}
              </span>
            </div>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">No cue running</span>
        )}

        <span className="hidden flex-1 @[440px]:block" />

        {showShortcuts && (
          <span className="hidden shrink-0 items-center gap-1.5 font-mono text-[10px] text-muted-foreground @[1100px]:inline-flex">
            <kbd className="rounded border bg-muted/50 px-1.5 py-px text-[9.5px]">space</kbd>
            go
            <kbd className="ml-1 rounded border bg-muted/50 px-1.5 py-px text-[9.5px]">⌫</kbd>
            back
          </span>
        )}
      </div>

      {/* Transport. `basis-full` below 700 puts it on its own line deterministically, and GO takes
          the whole width that buys — the inversion the ladder exists for. `h-auto` above 700 lets it
          match the tile heights, overriding Button's default h-10. */}
      <div className="flex shrink-0 basis-full items-stretch gap-2 @[700px]:ml-auto @[700px]:basis-auto">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={goDisabled}
          aria-label="Back"
          className="h-[52px] px-4 text-sm font-semibold uppercase tracking-wider @[440px]:h-10 @[700px]:h-auto @[1000px]:px-5"
        >
          <span aria-hidden="true">◀</span>
          <span className="hidden @[440px]:inline">BACK</span>
        </Button>
        <Button
          onClick={onGo}
          disabled={goDisabled}
          className={cn(
            'h-[52px] flex-1 text-[22px] font-bold uppercase tracking-[0.16em]',
            '@[440px]:h-10 @[440px]:text-base',
            '@[700px]:h-auto @[700px]:flex-none @[700px]:px-6 @[700px]:min-w-[100px]',
            '@[1000px]:px-8 @[1000px]:min-w-[120px]',
            !goDisabled && 'shadow-[0_6px_14px_rgba(59,130,246,0.35)]',
          )}
        >
          GO
        </Button>
      </div>
    </div>
  )
}

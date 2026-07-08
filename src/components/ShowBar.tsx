import { ArrowRight, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ShowBarProps {
  /** Leading "current stack" segment. Rendered only when non-null — Run passes it only when
   *  the stack tabs are hidden (single stack); Program + Prompt Book always pass it. */
  stackName?: string | null
  dbo: boolean
  onDbo: () => void
  bpm: number | null
  onTap: () => void
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
  /** The on-screen `space`/`⌫` keyboard hint. Default false — only Run passes true. */
  showShortcuts?: boolean
}

/**
 * Universal "show bar" (Row 3) shared across the three live-show views:
 * current stack · BLACKOUT · BPM/TAP · active → Next · (Run-only kbd hint) · BACK · GO.
 * GO is the largest, most prominent affordance. It reflects show state, not mode state, so
 * it renders identically in Program, Run, and Prompt Book.
 *
 * Responsive collapse is driven by the bar's OWN width via container queries (`@container`
 * + `@[NNpx]:`), not the viewport — the app sidebar insets the content region, so viewport
 * width ≠ content width. As the bar narrows it drops, in order: the kbd hint (@[1100px]),
 * cue NAMES keeping the Q-numbers (@[900px]), then secondary labels + the stack name and
 * looser gaps (@[720px]).
 */
export function ShowBar({
  stackName,
  dbo,
  onDbo,
  bpm,
  onTap,
  activeNumber,
  activeName,
  standbyNumber,
  standbyName,
  fadeRemainMs,
  onGo,
  onBack,
  goDisabled = false,
  showShortcuts = false,
}: ShowBarProps) {
  const isFading = fadeRemainMs != null && fadeRemainMs > 0

  return (
    <div className="@container flex items-stretch gap-2 px-4 py-2 border-b">
      {/* DBO tile.
          Tiles use `justify-start` (not `justify-center`) so the labels in
          DBO + BPM share the same y-baseline regardless of value font size. */}
      <button
        type="button"
        onClick={onDbo}
        aria-pressed={dbo}
        title="Toggle blackout"
        className={cn(
          'flex shrink-0 flex-col justify-start items-start gap-px rounded-md border px-3 py-1.5 transition-colors',
          'bg-card hover:bg-muted/40',
          dbo && 'border-red-700 bg-red-950/40 hover:bg-red-950/50 shadow-[0_0_12px_rgba(239,68,68,0.25)]',
        )}
      >
        <span
          className={cn(
            'text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground',
            dbo && 'text-red-300',
          )}
        >
          Blackout
        </span>
        <span
          className={cn(
            'font-mono text-lg font-bold tracking-wider leading-none',
            dbo ? 'text-red-300' : 'text-foreground',
          )}
        >
          DBO
        </span>
      </button>

      {/* BPM tile */}
      <div className="flex shrink-0 items-stretch rounded-md border bg-card overflow-hidden">
        <div className="flex flex-col justify-start gap-px px-3 py-1.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            BPM
          </span>
          <span className="font-mono text-lg font-bold leading-none text-foreground">
            {bpm ?? '—'}
          </span>
        </div>
        <button
          type="button"
          onClick={onTap}
          className="flex items-center justify-center px-3 text-xs font-bold tracking-[0.08em] uppercase border-l hover:bg-primary hover:text-primary-foreground transition-colors active:bg-primary active:text-primary-foreground"
        >
          TAP
        </button>
      </div>

      {/* Live state — flexes to fill. Dropped entirely at phone widths (the live cue is visible
          in the cue list below); `ml-auto` on the transport keeps it right-aligned there. */}
      <div className="hidden @[560px]:flex flex-1 items-center gap-2 @[720px]:gap-3.5 min-w-0 rounded-md border bg-card px-3 py-1.5">
        {stackName && (
          <>
            <span className="hidden @[720px]:block truncate max-w-[160px] text-sm font-medium shrink-0">
              {stackName}
            </span>
            <span className="hidden @[720px]:block text-muted-foreground/40 shrink-0">·</span>
          </>
        )}
        {activeNumber || activeName ? (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="size-[22px] rounded-full grid place-items-center bg-green-950 border border-green-900 text-green-400 shrink-0"
                style={{ animation: 'r-live-pulse 1.6s ease-in-out infinite' }}
              >
                <Play className="size-2.5 fill-current" strokeWidth={0} />
              </span>
              {activeNumber && (
                <span className="font-mono text-sm font-bold text-green-400 shrink-0">
                  {activeNumber}
                </span>
              )}
              <span
                className={cn(
                  'hidden @[900px]:block text-sm truncate min-w-0',
                  isFading ? 'text-amber-400 font-medium' : 'text-foreground font-medium',
                )}
              >
                {activeName ?? 'No cue running'}
              </span>
              {isFading && (
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[0.08em] uppercase text-amber-400 bg-amber-950/40 border border-amber-900 rounded-full px-2 py-px shrink-0">
                  <span
                    className="size-1.5 rounded-full bg-amber-400"
                    style={{ animation: 'r-fade-pulse 0.9s ease-in-out infinite' }}
                  />
                  <span className="hidden @[720px]:inline">FADING · </span>
                  {(fadeRemainMs! / 1000).toFixed(1)}s
                </span>
              )}
            </div>

            <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />

            <div className="flex items-center gap-2 min-w-0">
              <span className="hidden @[720px]:inline text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground shrink-0">
                Next
              </span>
              {standbyNumber && (
                <span className="font-mono text-xs font-bold text-blue-400 shrink-0">
                  {standbyNumber}
                </span>
              )}
              <span className="hidden @[900px]:inline text-xs text-muted-foreground truncate">
                {standbyName ?? 'end of stack'}
              </span>
            </div>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">No cue running</span>
        )}

        <span className="flex-1" />

        {showShortcuts && (
          <span className="hidden @[1100px]:inline-flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground shrink-0">
            <kbd className="rounded border bg-muted/50 px-1.5 py-px text-[9.5px]">space</kbd>
            go
            <kbd className="rounded border bg-muted/50 px-1.5 py-px text-[9.5px] ml-1">⌫</kbd>
            back
          </span>
        )}
      </div>

      {/* Transport. h-auto + items-stretch on the parent makes BACK/GO match
          the tile heights — overrides Button's default h-10. `ml-auto` right-aligns it at
          phone widths where the flex-1 live block is hidden. */}
      <div className="flex items-stretch gap-2 shrink-0 ml-auto">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={goDisabled}
          aria-label="Back"
          className="h-auto px-4 @[720px]:px-5 text-sm font-semibold tracking-wider uppercase"
        >
          <span aria-hidden="true">◀</span>
          <span className="hidden @[560px]:inline">BACK</span>
        </Button>
        <Button
          onClick={onGo}
          disabled={goDisabled}
          className={cn(
            'h-auto px-5 @[560px]:px-6 @[720px]:px-8 text-base font-bold tracking-[0.16em] uppercase min-w-[80px] @[560px]:min-w-[92px] @[720px]:min-w-[120px]',
            !goDisabled && 'shadow-[0_6px_14px_rgba(59,130,246,0.35)]',
          )}
        >
          GO
        </Button>
      </div>
    </div>
  )
}

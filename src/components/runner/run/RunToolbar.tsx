import { ArrowRight, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface RunToolbarProps {
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
}

/**
 * Top toolbar for the Run view redesign:
 * BLACKOUT · BPM/TAP · NOW + Next · keyboard hint · BACK · GO.
 * GO is the largest, most prominent affordance. Space = GO, Backspace = BACK.
 */
export function RunToolbar({
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
}: RunToolbarProps) {
  const isFading = fadeRemainMs != null && fadeRemainMs > 0

  return (
    <div className="flex items-stretch gap-2.5 px-4 py-2 border-b">
      {/* DBO tile.
          Tiles use `justify-start` (not `justify-center`) so the labels in
          DBO + BPM share the same y-baseline regardless of value font size. */}
      <button
        type="button"
        onClick={onDbo}
        aria-pressed={dbo}
        title="Toggle blackout"
        className={cn(
          'flex flex-col justify-start items-start gap-px rounded-md border px-3 py-1.5 transition-colors',
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
      <div className="flex items-stretch rounded-md border bg-card overflow-hidden">
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

      {/* Live state — flexes to fill */}
      <div className="flex flex-1 items-center gap-3.5 min-w-0 rounded-md border bg-card px-3 py-1.5">
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
                  'text-sm truncate min-w-0',
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
                  FADING · {(fadeRemainMs! / 1000).toFixed(1)}s
                </span>
              )}
            </div>

            <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />

            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground shrink-0">
                Next
              </span>
              {standbyNumber && (
                <span className="font-mono text-xs font-bold text-blue-400 shrink-0">
                  {standbyNumber}
                </span>
              )}
              <span className="text-xs text-muted-foreground truncate">
                {standbyName ?? 'end of stack'}
              </span>
            </div>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">No cue running</span>
        )}

        <span className="flex-1" />

        <span className="hidden md:inline-flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground shrink-0">
          <kbd className="rounded border bg-muted/50 px-1.5 py-px text-[9.5px]">space</kbd>
          go
          <kbd className="rounded border bg-muted/50 px-1.5 py-px text-[9.5px] ml-1">⌫</kbd>
          back
        </span>
      </div>

      {/* Transport. h-auto + items-stretch on the parent makes BACK/GO match
          the tile heights — overrides Button's default h-10. */}
      <div className="flex items-stretch gap-2 shrink-0">
        <Button
          variant="outline"
          onClick={onBack}
          className="h-auto px-5 text-sm font-semibold tracking-wider uppercase"
        >
          {'◀'} BACK
        </Button>
        <Button
          onClick={onGo}
          className="h-auto px-8 text-base font-bold tracking-[0.16em] uppercase shadow-[0_6px_14px_rgba(59,130,246,0.35)] min-w-[120px]"
        >
          GO
        </Button>
      </div>
    </div>
  )
}

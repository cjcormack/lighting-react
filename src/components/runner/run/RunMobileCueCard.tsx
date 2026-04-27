import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectCueQuery } from '@/store/cues'
import { resolveColourToHex } from '@/components/fx/colourUtils'
import { MiniStage } from '@/components/runner/program/CueCardEditor/MiniStage'
import { CueDetailContent } from '@/components/cues/CueDetailContent'
import { collectCueTargets } from '@/components/runner/program/CueCardEditor/targetUtils'
import { formatFadeText } from '@/lib/cueUtils'
import type { CueStackCueEntry } from '@/api/cueStacksApi'

export type CardKind = 'cur' | 'nxt'
export type ExpansionMode = 'stage' | 'details'
export interface MobileExpansion {
  card: CardKind
  mode: ExpansionMode
}

interface RunMobileCueCardProps {
  kind: CardKind
  cue: CueStackCueEntry | null
  projectId: number
  /** Mutually-exclusive expansion across the two cards. null = both collapsed. */
  expansion: MobileExpansion | null
  onSetExpansion: (next: MobileExpansion | null) => void
  /** Counter for the Current card ("3 / 12"). */
  counter?: string | null
  /** Open the bottom-sheet picker (Next card "Change" button). */
  onChange?: () => void
  /** 0..1 fade progress when this is the Current card and the cue is fading in. */
  fadeProgress?: number | null
  /** Remaining ms in the fade-in. */
  fadeRemainMs?: number | null
}

/**
 * Single mobile cue card used for both "Now playing" (current) and "Up next".
 * Hero Q + name + palette block, an internal Stage / Details toggle (mutually
 * exclusive across the two cards — only one body is open at a time), and a
 * compact meta strip. Performance note on Current is subtle italic; trigger
 * note on Next is amber-styled to draw the operator's eye.
 */
export function RunMobileCueCard({
  kind,
  cue,
  projectId,
  expansion,
  onSetExpansion,
  counter,
  onChange,
  fadeProgress,
  fadeRemainMs,
}: RunMobileCueCardProps) {
  const isCur = kind === 'cur'
  const isExpanded = expansion?.card === kind
  const view = isExpanded ? expansion.mode : null
  const isFading =
    isCur && fadeProgress != null && fadeProgress < 1

  const setMode = (mode: ExpansionMode) => {
    if (isExpanded && view === mode) onSetExpansion(null)
    else onSetExpansion({ card: kind, mode })
  }

  return (
    <section
      className={cn(
        'rounded-xl border overflow-hidden flex flex-col bg-card shrink-0',
        isCur
          ? 'border-green-900 shadow-[0_0_0_1px_rgba(20,83,45,0.25)]'
          : 'border-blue-900/70',
        isFading && 'border-amber-700/70 shadow-[0_0_0_1px_rgba(133,77,14,0.4),0_0_12px_rgba(251,191,36,0.18)_inset]',
      )}
    >
      {/* Header strip */}
      <header
        className={cn(
          'flex items-center gap-2 px-3 py-2 border-b font-mono text-[10px] font-bold uppercase tracking-[0.12em]',
          isCur
            ? 'bg-green-950/40 text-green-400 border-green-900'
            : 'bg-blue-950/40 text-blue-400 border-blue-900/70',
          isFading && 'bg-amber-950/40 text-amber-400 border-amber-900',
        )}
      >
        <span
          className={cn(
            'size-1.5 rounded-full bg-current',
            isCur && !isFading && 'shadow-[0_0_6px_currentColor]',
          )}
          style={
            isCur && !isFading
              ? { animation: 'r-fade-pulse 1.6s ease-in-out infinite' }
              : isFading
                ? { animation: 'r-fade-pulse 0.9s ease-in-out infinite' }
                : undefined
          }
        />
        <span>{isCur ? 'Now playing' : 'Up next'}</span>
        {isFading && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-amber-900 bg-amber-950/60 px-2 py-px text-[10px] tracking-[0.08em]">
            FADING · {((fadeRemainMs ?? 0) / 1000).toFixed(1)}s
          </span>
        )}
        {!isFading && counter && <span className="ml-auto rounded-full border border-border bg-muted/30 px-2 py-px text-[9.5px] text-muted-foreground tracking-[0.08em]">{counter}</span>}
        {!isCur && onChange && (
          <button
            type="button"
            onClick={onChange}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-blue-900/60 bg-blue-950/60 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-blue-300 active:scale-95"
          >
            Change
            <ChevronDown className="size-2.5" />
          </button>
        )}
      </header>

      {/* Fade progress bar — only on Current */}
      {isCur && isFading && (
        <div className="h-[3px] bg-amber-950/40 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]"
            style={{
              width: `${(fadeProgress! * 100).toFixed(2)}%`,
              transition: 'width 80ms linear',
            }}
          />
        </div>
      )}

      {!cue ? (
        <div className="px-4 py-7 text-center text-sm text-muted-foreground italic">
          {isCur ? 'No cue running. Press GO to start.' : 'End of stack.'}
        </div>
      ) : (
        <>
          {/* Q + name + palette */}
          {isCur ? (
            <div className="px-3 pt-3 pb-2 text-center">
              <div
                className="font-mono font-extrabold leading-[0.95] tracking-tight text-green-400"
                style={{
                  fontSize: 'clamp(56px, 16cqw, 96px)',
                  textShadow: '0 0 24px rgba(74,222,128,0.3)',
                }}
              >
                {cue.cueNumber ? `Q${cue.cueNumber}` : '—'}
              </div>
              <div className="mt-1 text-[15px] font-semibold text-foreground">
                {cue.name}
              </div>
              <CardPalette cue={cue} projectId={projectId} variant="centered" />
            </div>
          ) : (
            <div className="px-3 py-2 grid grid-cols-[auto_1fr_auto] items-center gap-2.5">
              <span className="font-mono text-2xl font-extrabold text-blue-400">
                {cue.cueNumber ? `Q${cue.cueNumber}` : '—'}
              </span>
              <span className="text-[13px] font-semibold text-foreground truncate">
                {cue.name}
              </span>
              <CardPalette cue={cue} projectId={projectId} variant="inline" />
            </div>
          )}

          {/* Stage / Details toggle */}
          <div
            className={cn(
              'mx-3 mt-2 flex rounded-md border bg-muted/20 p-0.5',
              !isExpanded && 'opacity-65',
            )}
          >
            <ToggleButton
              active={isExpanded && view === 'stage'}
              onClick={() => setMode('stage')}
              label="Stage"
              accent={isCur ? 'green' : 'blue'}
            />
            <ToggleButton
              active={isExpanded && view === 'details'}
              onClick={() => setMode('details')}
              label="Details"
              accent={isCur ? 'green' : 'blue'}
            />
          </div>

          {/* Expanded body */}
          {isExpanded && view === 'stage' && (
            <div className="mx-3 mt-2.5">
              <MobileStage cueId={cue.id} projectId={projectId} compact={!isCur} />
            </div>
          )}
          {isExpanded && view === 'details' && (
            <div className="mx-3 mt-2.5 space-y-3">
              <MobileDetails cueId={cue.id} projectId={projectId} />
            </div>
          )}

          {/* Compact meta strip */}
          <div className="px-3 pt-2.5 pb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[11px] text-muted-foreground">
            <Cell label="Fade" value={formatFadeText(cue.fadeDurationMs, cue.fadeCurve)} />
            {cue.autoAdvance && (
              <>
                <span>·</span>
                <Cell label="Auto" value="On" />
              </>
            )}
          </div>

          {/* Notes */}
          {cue.notes && isCur && (
            <div className="mx-3 mb-3 rounded-md border bg-muted/20 px-2.5 py-2 text-[12px] italic text-muted-foreground">
              {cue.notes}
            </div>
          )}
          {cue.notes && !isCur && (
            <div className="mx-3 mb-3 rounded-md border border-amber-700/40 bg-amber-950/30 px-2.5 py-2 text-[12px] text-amber-200 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
              <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] text-amber-400">
                Trigger
              </span>
              <span />
              <span />
              <span className="font-medium">{cue.notes}</span>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function ToggleButton({
  active,
  onClick,
  label,
  accent,
}: {
  active: boolean
  onClick: () => void
  label: string
  accent: 'green' | 'blue'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex-1 inline-flex items-center justify-center gap-1.5 rounded text-[11.5px] font-semibold py-1.5 transition-colors',
        active
          ? 'bg-card text-foreground shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]'
          : 'text-muted-foreground',
        active && accent === 'green' && 'text-green-400',
        active && accent === 'blue' && 'text-blue-300',
      )}
    >
      {label}
    </button>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 min-w-0">
      <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground/80">
        {label}
      </span>
      <span className="text-[11.5px] text-foreground">{value}</span>
    </span>
  )
}

/**
 * Palette swatches for the mobile card. Lazy-loads the full cue (palette isn't
 * on `CueStackCueEntry`), but only triggers the query when the cue id is set.
 */
function CardPalette({
  cue,
  projectId,
  variant,
}: {
  cue: CueStackCueEntry
  projectId: number
  variant: 'centered' | 'inline'
}) {
  const { data } = useProjectCueQuery({ projectId, cueId: cue.id })
  const palette = data?.palette ?? []
  if (palette.length === 0) return null

  if (variant === 'centered') {
    return (
      <div className="mx-auto mt-2.5 flex h-1 w-[70%] max-w-[200px] overflow-hidden rounded-full border border-border/40">
        {palette.map((c, i) => (
          <i
            key={`${c}-${i}`}
            className="block flex-1"
            style={{ background: resolveColourToHex(c) }}
          />
        ))}
      </div>
    )
  }
  return (
    <span className="flex h-1 w-14 overflow-hidden rounded-full border border-border/40">
      {palette.map((c, i) => (
        <i
          key={`${c}-${i}`}
          className="block flex-1"
          style={{ background: resolveColourToHex(c) }}
        />
      ))}
    </span>
  )
}

function MobileStage({
  cueId,
  projectId,
  compact,
}: {
  cueId: number
  projectId: number
  compact: boolean
}) {
  const { data } = useProjectCueQuery({ projectId, cueId })
  const targets = data ? collectCueTargets(data) : []
  return (
    <MiniStage
      projectId={projectId}
      targets={targets}
      heightClass={compact ? 'h-20' : 'h-24'}
    />
  )
}

function MobileDetails({ cueId, projectId }: { cueId: number; projectId: number }) {
  const { data } = useProjectCueQuery({ projectId, cueId })
  if (!data) {
    return <p className="text-xs text-muted-foreground italic">Loading…</p>
  }
  return <CueDetailContent cue={data} projectId={projectId} />
}

import { useMemo, useRef, useState } from 'react'
import {
  ChevronRight,
  Circle,
  Layers,
  ListChecks,
  Play,
  Sliders,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useNarrowContainer } from '@/hooks/useNarrowContainer'
import { useProjectCueQuery } from '@/store/cues'
import { formatFadeText } from '@/lib/cueUtils'
import { resolveColourToHex } from '@/components/fx/colourUtils'
import { collectCueTargets } from '@/components/runner/program/CueCardEditor/targetUtils'
import type { Cue, CueTarget } from '@/api/cuesApi'
import type { CueStackCueEntry } from '@/api/cueStacksApi'
import { BoundControlBadge } from '@/components/surfaces/BoundControlBadge'
import { RunOutputPane } from './RunOutputPane'
import { RunTargetsPane } from './RunTargetsPane'
import { RunPropsPane } from './RunPropsPane'

const TABS_BREAKPOINT = 1000

interface RunCueCardProps {
  cue: CueStackCueEntry
  projectId: number
  /** True when this cue is currently outputting on stage. */
  isActive: boolean
  /** True when this cue is queued to fire on the next GO. */
  isStandby: boolean
  /** True when this cue has already played. */
  isDone: boolean
  /** True when this cue is currently expanded inline. */
  expanded: boolean
  /** Set this cue as the next-up GO target. */
  onSetStandby: () => void
  /** Toggle expansion of this cue's body. */
  onToggleExpanded: () => void
  /** 0..1 fade progress when this cue is fading in. null when not fading. */
  fadeProgress: number | null
  /** Remaining ms in the fade-in. null when not fading. */
  fadeRemainMs: number | null
}

type Tab = 'output' | 'targets' | 'props'

/**
 * Inline expanding read-only cue card. The collapsed row is the cue summary
 * (state pip · Q · palette · name · target chips · fade); clicking a non-active
 * row queues it as next, clicking the active row toggles expansion. The
 * dedicated chevron button always toggles expansion.
 *
 * The expanded body shows three side-by-side read-only panes (Output · Targets
 * · Properties) on wide artboards; below `TABS_BREAKPOINT` of card width the
 * panes collapse to a tab bar with one active pane.
 *
 * Full cue data is lazy-loaded only when the card is expanded — matches the
 * Program editor pattern. A sticky placeholder via a ref keeps the body from
 * blanking during a refetch.
 */
export function RunCueCard({
  cue,
  projectId,
  isActive,
  isStandby,
  isDone,
  expanded,
  onSetStandby,
  onToggleExpanded,
  fadeProgress,
  fadeRemainMs,
}: RunCueCardProps) {
  const [bodyRef, narrow] = useNarrowContainer(TABS_BREAKPOINT)
  const [tab, setTab] = useState<Tab>('output')

  const { data: fullCue, isFetching } = useProjectCueQuery(
    { projectId, cueId: cue.id },
    { skip: !expanded },
  )

  // Sticky placeholder so a PATCH-driven refetch doesn't flash an empty body.
  // Cleared on cue-id change so a recycled component slot doesn't show stale data.
  const lastCueRef = useRef<Cue | null>(null)
  const lastCueIdRef = useRef<number>(cue.id)
  if (lastCueIdRef.current !== cue.id) {
    lastCueRef.current = null
    lastCueIdRef.current = cue.id
  }
  if (fullCue) lastCueRef.current = fullCue
  const cueData = fullCue ?? lastCueRef.current

  const targets: CueTarget[] = useMemo(
    () => (cueData ? collectCueTargets(cueData) : []),
    [cueData],
  )
  const targetCount = targets.length
  const effectCount = cueData?.adHocEffects.length ?? 0
  const triggerCount = cueData?.triggers.length ?? 0

  const isFading = fadeProgress != null && fadeProgress < 1
  const fadeText = formatFadeText(cue.fadeDurationMs, cue.fadeCurve)

  const handleHeaderClick = () => {
    if (isActive) {
      onToggleExpanded()
    } else {
      onSetStandby()
    }
  }

  return (
    <div
      data-cue-row={cue.id}
      className={cn(
        'mx-2 my-1 rounded-lg border bg-card overflow-hidden transition-colors',
        isActive && 'border-green-500/70 bg-green-950/15',
        isStandby && !isActive && 'border-blue-500/60',
        isActive && isFading && 'border-amber-700/70 bg-amber-950/10',
        !isActive && !isStandby && 'hover:border-muted-foreground/40',
        isDone && !expanded && !isActive && !isStandby && 'opacity-60',
      )}
    >
      {/* Header row */}
      <div
        onClick={handleHeaderClick}
        title={
          isActive
            ? 'Currently running — click to expand'
            : 'Click to queue as next · chevron to expand'
        }
        className={cn(
          'grid items-center gap-3 px-3.5 py-2.5 cursor-pointer relative',
          'grid-cols-[22px_56px_80px_minmax(0,1fr)_auto_auto_28px]',
          'max-[999px]:grid-cols-[22px_50px_70px_minmax(0,1fr)_auto_28px]',
          'max-[699px]:grid-cols-[22px_50px_minmax(0,1fr)_auto_28px]',
          isActive && 'hover:bg-green-500/[0.04]',
          !isActive && 'hover:bg-blue-500/[0.04]',
        )}
      >
        {/* Live cue green left bar */}
        {isActive && (
          <span
            className={cn(
              'absolute left-0 top-2 bottom-2 w-[3px] rounded-r',
              isFading
                ? 'bg-gradient-to-b from-green-500 to-amber-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]'
                : 'bg-green-500 shadow-[0_0_8px_rgba(74,222,128,0.6)]',
            )}
          />
        )}

        {/* State pip */}
        <CueStatePip isActive={isActive} isStandby={isStandby} />

        {/* Q-number */}
        <div
          className={cn(
            'font-mono text-sm font-bold truncate',
            isActive && 'text-green-400',
            isStandby && !isActive && 'text-blue-300',
          )}
        >
          {cue.cueNumber ? `Q${cue.cueNumber}` : '—'}
        </div>

        {/* Palette bar — hidden on narrow */}
        <div className="h-[22px] rounded overflow-hidden flex max-[699px]:hidden">
          <PaletteBar palette={cueData?.palette ?? []} />
        </div>

        {/* Name + bound-control badge */}
        <div
          className={cn(
            'text-sm font-medium truncate flex items-center gap-2 min-w-0',
            isActive && 'text-green-300 font-semibold',
            isStandby && !isActive && 'text-blue-300 font-semibold',
          )}
        >
          <span className="truncate min-w-0">{cue.name}</span>
          <BoundControlBadge
            className="inline-flex shrink-0"
            match={{ type: 'fireCue', cueId: cue.id }}
          />
        </div>

        {/* Targets / FX / hook chips — hidden on compact widths */}
        <div className="flex items-center gap-1 flex-nowrap shrink-0 max-[999px]:hidden">
          {targets.slice(0, 3).map((t) => (
            <TargetChip key={`${t.type}:${t.key}`} target={t} />
          ))}
          {targetCount > 3 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              +{targetCount - 3}
            </Badge>
          )}
          {effectCount > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-400 bg-amber-500/10"
            >
              {effectCount} FX
            </Badge>
          )}
          {triggerCount > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-amber-700/40 text-amber-400 bg-amber-950/30"
            >
              {triggerCount} hook{triggerCount === 1 ? '' : 's'}
            </Badge>
          )}
        </div>

        {/* Fade / ease — replaced with FADING badge while fading */}
        {isFading ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[0.08em] uppercase text-amber-400 bg-amber-950/40 border border-amber-900 rounded-full px-2 py-px shrink-0">
            <span
              className="size-1.5 rounded-full bg-amber-400"
              style={{ animation: 'r-fade-pulse 0.9s ease-in-out infinite' }}
            />
            {((fadeRemainMs ?? 0) / 1000).toFixed(1)}s
          </span>
        ) : (
          <div className="flex flex-col items-end font-mono text-xs gap-0 leading-tight shrink-0">
            <span className="text-foreground">{fadeText}</span>
            {cue.autoAdvance && (
              <span className="text-[9px] text-blue-400 uppercase tracking-wide">
                auto
              </span>
            )}
          </div>
        )}

        {/* Chevron toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpanded()
          }}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          title={expanded ? 'Collapse details' : 'Expand details'}
          className="size-7 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors shrink-0"
        >
          <ChevronRight
            className={cn('size-4 transition-transform', expanded && 'rotate-90')}
          />
        </button>
      </div>

      {/* Fade progress bar — pinned under the header while fading */}
      {isFading && (
        <div className="h-[3px] bg-amber-950/40 overflow-hidden border-b border-border/50">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]"
            style={{
              width: `${(fadeProgress * 100).toFixed(2)}%`,
              transition: 'width 80ms linear',
            }}
          />
        </div>
      )}

      {/* Inline note when collapsed */}
      {!expanded && cue.notes && (
        <div className="px-3.5 pb-2 -mt-1.5 pl-[92px] font-mono text-[10.5px] italic text-muted-foreground">
          {'// '}
          {cue.notes}
        </div>
      )}

      {/* Expanded body */}
      {expanded && (
        <div ref={bodyRef} className="border-t bg-background">
          {narrow && (
            <div className="flex items-stretch border-b bg-muted/20 px-1">
              <TabButton
                active={tab === 'output'}
                onClick={() => setTab('output')}
                icon={<ListChecks className="size-3.5" />}
                label="Output"
                liveLabel={isActive}
              />
              <TabButton
                active={tab === 'targets'}
                onClick={() => setTab('targets')}
                icon={<Layers className="size-3.5" />}
                label="Targets"
                count={targetCount}
              />
              <TabButton
                active={tab === 'props'}
                onClick={() => setTab('props')}
                icon={<Sliders className="size-3.5" />}
                label="Properties"
              />
            </div>
          )}

          <div
            className={cn(
              narrow ? 'block' : 'grid grid-cols-3 divide-x',
              'min-h-[320px] max-h-[min(640px,calc(100vh-12rem))]',
            )}
          >
            <PaneShell
              title="Targets"
              count={targetCount}
              icon={<Layers className="size-3.5" />}
              active={!narrow || tab === 'targets'}
              hideTitleInTabs={narrow}
            >
              <RunTargetsPane projectId={projectId} targets={targets} />
            </PaneShell>

            <PaneShell
              title="Cue properties"
              icon={<Sliders className="size-3.5" />}
              active={!narrow || tab === 'props'}
              hideTitleInTabs={narrow}
            >
              {cueData ? (
                <RunPropsPane cue={cueData} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {isFetching ? 'Loading…' : 'No cue data.'}
                </p>
              )}
            </PaneShell>

            <PaneShell
              title="Output — what plays"
              icon={<ListChecks className="size-3.5" />}
              active={!narrow || tab === 'output'}
              hideTitleInTabs={narrow}
              live={isActive}
            >
              <RunOutputPane
                cue={cueData}
                projectId={projectId}
                isActive={isActive}
                isStandby={isStandby}
                isDone={isDone}
                isLoading={isFetching}
              />
            </PaneShell>
          </div>
        </div>
      )}
    </div>
  )
}

function CueStatePip({ isActive, isStandby }: { isActive: boolean; isStandby: boolean }) {
  if (isActive) {
    return (
      <span className="size-[22px] rounded-full grid place-items-center bg-green-950 border border-green-900 text-green-400 shadow-[0_0_8px_rgba(74,222,128,0.4)]">
        <Play className="size-3 fill-current" strokeWidth={0} />
      </span>
    )
  }
  if (isStandby) {
    return (
      <span className="size-[22px] rounded-full grid place-items-center bg-blue-950 border border-blue-900 text-blue-300">
        <Circle className="size-1.5 fill-current" strokeWidth={0} />
      </span>
    )
  }
  return (
    <span className="size-[22px] rounded-full grid place-items-center bg-muted border border-border">
      <span className="size-2 rounded-full bg-muted-foreground/30" />
    </span>
  )
}

function PaletteBar({ palette }: { palette: string[] }) {
  if (palette.length === 0) {
    return <div className="w-full h-full bg-muted/30" />
  }
  return (
    <div className="flex h-full w-full">
      {palette.slice(0, 6).map((c, i) => (
        <span
          key={`${c}-${i}`}
          className="flex-1 min-w-[6px]"
          style={{ background: resolveColourToHex(c) }}
        />
      ))}
    </div>
  )
}

function TargetChip({ target }: { target: CueTarget }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] px-1.5 py-0 max-w-[120px]',
        target.type === 'fixture'
          ? 'border-amber-500/40 text-amber-400 bg-amber-500/10'
          : 'border-blue-500/40 text-blue-300 bg-blue-500/10',
      )}
    >
      <span className="truncate">{target.key}</span>
    </Badge>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
  liveLabel,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count?: number
  liveLabel?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
      {count != null && count > 0 && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-0.5">
          {count}
        </Badge>
      )}
      {liveLabel && (
        <Badge
          variant="outline"
          className="text-[9px] px-1.5 py-0 ml-0.5 border-green-900 bg-green-950 text-green-400"
        >
          LIVE
        </Badge>
      )}
    </button>
  )
}

function PaneShell({
  title,
  count,
  icon,
  active,
  hideTitleInTabs,
  live,
  children,
}: {
  title: string
  count?: number
  icon?: React.ReactNode
  active: boolean
  hideTitleInTabs?: boolean
  live?: boolean
  children: React.ReactNode
}) {
  if (!active) return null
  return (
    <div className="flex flex-col min-h-0 overflow-hidden">
      {!hideTitleInTabs && (
        <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-muted/10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-10">
          {icon}
          <span>{title}</span>
          {count != null && count > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
              {count}
            </Badge>
          )}
          {live && (
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0 ml-auto border-green-900 bg-green-950 text-green-400"
            >
              LIVE
            </Badge>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3">{children}</div>
    </div>
  )
}

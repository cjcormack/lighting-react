import { ArrowLeft, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MarkerRow } from '@/components/runner/MarkerRow'
import type { ExpansionMode } from '@/components/runner/run/CueCardBody'
import type { CueAnchorDto } from '../../api/promptBooksApi'
import type { CueStackCueEntry } from '../../api/cueStacksApi'
import type { DesyncWarning, FlatCue } from '../../lib/promptBook/desync'
import type { ShowRailRow } from '../../lib/promptBook/geometry'
import type { CueRunStatus } from './AnchorOverlay'
import { DesyncWarningsPanel } from './DesyncWarningsPanel'
import { PromptBookCueCard } from './PromptBookCueCard'

interface CueStackPanelProps {
  /** Rail rows in show order — headers, cue cards, and separators (markers). */
  rows: ShowRailRow[]
  anchorByCue: Map<number, CueAnchorDto>
  /** Full stack entries by cue id — feeds each expanded card's palette/notes/auto. */
  cueEntryByCue: Map<number, CueStackCueEntry>
  statusOf: (cueId: number) => CueRunStatus
  warningsByCue: Map<number, DesyncWarning[]>
  warnings: DesyncWarning[]
  showWarnings: boolean
  locked: boolean
  /** Cue currently armed for click-to-place on the script. */
  placingCueId: number | null
  /** Cue ids rendered as expanded cards (live + next by default). */
  expandedCues: Set<number>
  onToggleExpanded: (cueId: number) => void
  /** Stage/Details mode per cue — the page owns it so it persists across cue changes. */
  modeOf: (cueId: number, status: CueRunStatus) => ExpansionMode | null
  onCueModeChange: (cueId: number, status: CueRunStatus, mode: ExpansionMode | null) => void
  /** Fade-in progress/remaining for the live cue (drives its amber fade bar). Only the
   *  live card (kind='cur') reads these; other cards ignore them. */
  fadeProgress: number | null
  fadeRemainMs: number | null
  /** The stack the transport acts on — only its cues can be armed as the next GO. */
  activeStackId: number | null
  onCueClick: (cue: FlatCue) => void
  onRemoveAnchor: (cueId: number) => void
  onWarningClick: (warning: DesyncWarning) => void
  /** Arm a cue as the next GO (sets standby). */
  onSetStandby: (cueId: number) => void
  /** Jump to the cue's editor. */
  onEditCue: (cueId: number) => void
  goDisabled: boolean
  /** Whether the show is running — drives the header dot colour + a "Stopped" label. */
  showActive: boolean
  onGo: () => void
  onBack: () => void
  stackName: string | null
  bpm: number | null
  onTap: () => void
  dbo: boolean
  onDbo: () => void
  projectId: number
  /** Rendered inside the tablet/phone drawer — shows a close affordance, drops the
   *  border and the transport (the narrow layout carries its own bottom transport). */
  inDrawer?: boolean
  onClose?: () => void
}

/**
 * Right pane: the flattened show order as one list of Run-style cue cards. The live
 * (green) and next (blue) cues expand by default into full cards; every other cue is
 * a compact row that can be expanded on demand, with MARKER separators between them.
 * Clicking a card/row navigates to that cue's anchor — it never fires a cue; a per-card
 * "Set next" arms the next GO. The header (BPM · TAP · DBO) and BACK/GO transport
 * mirror the Run view.
 */
export function CueStackPanel({
  rows,
  anchorByCue,
  cueEntryByCue,
  statusOf,
  warningsByCue,
  warnings,
  showWarnings,
  locked,
  placingCueId,
  expandedCues,
  onToggleExpanded,
  modeOf,
  onCueModeChange,
  fadeProgress,
  fadeRemainMs,
  activeStackId,
  onCueClick,
  onRemoveAnchor,
  onWarningClick,
  onSetStandby,
  onEditCue,
  goDisabled,
  showActive,
  onGo,
  onBack,
  stackName,
  bpm,
  onTap,
  dbo,
  onDbo,
  projectId,
  inDrawer,
  onClose,
}: CueStackPanelProps) {
  const hasCues = rows.some((r) => r.type === 'cue')

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full flex-col bg-muted/20',
        inDrawer ? '' : 'max-w-[380px] min-w-[300px] border-l',
      )}
    >
      {/* Header — mirrors the Run view's top strip (stack name · BPM · TAP · DBO). */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b bg-card px-2">
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            showActive ? 'bg-emerald-500 shadow-[0_0_6px_#22c55e]' : 'bg-muted-foreground/40',
          )}
        />
        <span className="truncate text-sm font-medium">{stackName ?? 'Cue stack'}</span>
        {!showActive && (
          <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Stopped
          </span>
        )}
        <span className="flex-1" />
        <span className="min-w-8 text-right font-mono text-xs text-muted-foreground tabular-nums">
          {bpm ?? '—'}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={onTap}
          className="h-8 px-2 text-xs font-bold tracking-wider"
        >
          TAP
        </Button>
        <Button
          variant={dbo ? 'destructive' : 'outline'}
          size="sm"
          onClick={onDbo}
          className={cn(
            'h-8 px-2 text-xs font-bold tracking-wider',
            dbo && 'shadow-[0_0_14px_rgba(200,32,32,0.55)]',
          )}
        >
          DBO
        </Button>
        {inDrawer && onClose && (
          <Button variant="ghost" size="icon-sm" aria-label="Close cues" onClick={onClose}>
            <X className="size-4" />
          </Button>
        )}
      </div>

      {showWarnings && <DesyncWarningsPanel warnings={warnings} onWarningClick={onWarningClick} />}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {!hasCues && (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            No cues in the show yet. Build the show in Program first.
          </p>
        )}
        {rows.map((row) => {
          if (row.type === 'header') {
            return (
              <div
                key={`h-${row.stackId}`}
                className="px-2 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground/80 uppercase"
              >
                {row.stackName}
              </div>
            )
          }
          if (row.type === 'separator') {
            return <MarkerRow key={`s-${row.id}`} name={row.name} />
          }
          const status = statusOf(row.cue.cueId)
          return (
            <PromptBookCueCard
              key={row.cue.cueId}
              cue={row.cue}
              status={status}
              anchor={anchorByCue.get(row.cue.cueId)}
              cueEntry={cueEntryByCue.get(row.cue.cueId)}
              projectId={projectId}
              warnings={warningsByCue.get(row.cue.cueId) ?? []}
              locked={locked}
              placing={placingCueId === row.cue.cueId}
              expanded={expandedCues.has(row.cue.cueId)}
              mode={modeOf(row.cue.cueId, status)}
              onModeChange={(m) => onCueModeChange(row.cue.cueId, status, m)}
              fadeProgress={fadeProgress}
              fadeRemainMs={fadeRemainMs}
              canSetNext={!goDisabled && row.cue.stackId === activeStackId}
              onCueClick={() => onCueClick(row.cue)}
              onToggleExpanded={() => onToggleExpanded(row.cue.cueId)}
              onSetStandby={() => onSetStandby(row.cue.cueId)}
              onRemoveAnchor={() => onRemoveAnchor(row.cue.cueId)}
              onEditCue={() => onEditCue(row.cue.cueId)}
            />
          )
        })}
      </div>

      {/* Transport — mirrors the Run mobile footer. Omitted in the drawer, where the
          narrow layout supplies its own bottom transport (avoids a duplicate BACK/GO). */}
      {!inDrawer && (
        <div className="grid grid-cols-[1fr_2fr] gap-2 border-t p-3">
          <Button
            variant="outline"
            onClick={onBack}
            disabled={goDisabled}
            className="h-14 text-base font-bold tracking-wider uppercase"
          >
            <ArrowLeft className="size-5" />
            Back
          </Button>
          <Button
            onClick={onGo}
            disabled={goDisabled}
            className="h-14 text-2xl font-bold tracking-[0.16em] uppercase"
          >
            GO
          </Button>
        </div>
      )}
    </div>
  )
}

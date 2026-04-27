import { useState, useCallback, useMemo } from 'react'
import { ArrowLeft, ChevronDown, List, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { StackPickerSheet } from '../StackPickerSheet'
import { MobileCueListSheet } from '../MobileCueListSheet'
import { RunMobileCueCard, type MobileExpansion } from './RunMobileCueCard'
import type { ShowDetails, ShowEntryDto } from '@/api/showApi'
import type { CueStack, CueStackCueEntry } from '@/api/cueStacksApi'

export interface RunnerDisplayState {
  activeCue: CueStackCueEntry | null
  standbyCue: CueStackCueEntry | null
  nextStackEntry: ShowEntryDto | null
  /** 0..1 while the active cue is fading in, null otherwise. */
  fadeProgress: number | null
  autoProgress: number | null
  activeCueId: number | null
  standbyCueId: number | null
  completedCueIds: number[]
}

interface RunMobileProps {
  show: ShowDetails
  activeEntryId: number | null
  stack: CueStack | undefined
  stackMap: Map<number, CueStack>
  display: RunnerDisplayState
  bpm: number | null
  dbo: boolean
  onGo: () => void
  onBack: () => void
  onDbo: () => void
  onTap: () => void
  onSwitchToEntry: (entry: ShowEntryDto) => void
  onRequeueCue: (cueId: number) => void
  projectId: number
  /** ms remaining for the active cue's fade-in. null when not fading. */
  fadeRemainMs: number | null
}

/**
 * Mobile takeover for the Run view. Replaces the previous `ShowRunnerMobile`
 * hero-and-standby layout with the Run-redesign's stacked Current + Next cards
 * (each with an internal Stage / Details toggle), a bottom-sheet picker for
 * re-queueing, and a fixed BACK + GO transport.
 */
export function RunMobile({
  show,
  activeEntryId,
  stack,
  stackMap,
  display,
  bpm,
  dbo,
  onGo,
  onBack,
  onDbo,
  onTap,
  onSwitchToEntry,
  onRequeueCue,
  projectId,
  fadeRemainMs,
}: RunMobileProps) {
  const cues: CueStackCueEntry[] = stack?.cues ?? []
  const [stackPickerOpen, setStackPickerOpen] = useState(false)
  const [cueListOpen, setCueListOpen] = useState(false)
  const [expansion, setExpansion] = useState<MobileExpansion | null>({
    card: 'cur',
    mode: 'stage',
  })

  const { activeCue, standbyCue, nextStackEntry, fadeProgress } = display

  const playable = useMemo(
    () => cues.filter((c) => c.cueType === 'STANDARD'),
    [cues],
  )
  const curIdx = activeCue ? playable.findIndex((c) => c.id === activeCue.id) : -1
  const counter =
    activeCue && curIdx >= 0 ? `${curIdx + 1} / ${playable.length}` : null

  const handleSelectCueFromList = useCallback(
    (cueId: number) => {
      onRequeueCue(cueId)
      setCueListOpen(false)
    },
    [onRequeueCue],
  )

  const goLabel = standbyCue || nextStackEntry ? 'GO' : 'END'
  const goDisabled = !standbyCue && !nextStackEntry

  return (
    <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
      {/* Top strip */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b bg-card px-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setStackPickerOpen(true)}
          className="flex items-center gap-1 h-9 px-2 min-w-0 max-w-[45%]"
          aria-label="Switch stack"
        >
          <span className="truncate text-sm font-medium">
            {stack?.name ?? 'No stack'}
          </span>
          {stack?.loop && (
            <RotateCcw className="size-3 shrink-0 text-muted-foreground" />
          )}
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setCueListOpen(true)}
          aria-label="Open cue list"
        >
          <List className="size-4" />
        </Button>

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          <span className="font-mono text-xs text-muted-foreground tabular-nums min-w-8 text-right">
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
        </div>

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
      </div>

      {/* Stacked Current + Next cards */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2.5 bg-background">
        <RunMobileCueCard
          kind="cur"
          cue={activeCue}
          projectId={projectId}
          expansion={expansion}
          onSetExpansion={setExpansion}
          counter={counter}
          fadeProgress={fadeProgress}
          fadeRemainMs={fadeRemainMs}
        />
        <RunMobileCueCard
          kind="nxt"
          cue={standbyCue}
          projectId={projectId}
          expansion={expansion}
          onSetExpansion={setExpansion}
          onChange={() => setCueListOpen(true)}
        />

        {!standbyCue && nextStackEntry && (
          <div className="rounded-lg border border-blue-900/60 bg-blue-950/20 px-3 py-2 text-sm text-blue-300 italic">
            End of stack — next stack: {nextStackEntry.cueStackName}
          </div>
        )}
      </div>

      {/* GO / BACK footer */}
      <div
        className="grid grid-cols-[1fr_2fr] gap-2 border-t p-3 shrink-0 bg-background"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <Button
          variant="outline"
          onClick={onBack}
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
          {goLabel}
        </Button>
      </div>

      {/* Sheets */}
      <StackPickerSheet
        open={stackPickerOpen}
        onOpenChange={setStackPickerOpen}
        entries={show.entries}
        activeEntryId={activeEntryId}
        stackMap={stackMap}
        onSwitchToEntry={onSwitchToEntry}
      />
      <MobileCueListSheet
        open={cueListOpen}
        onOpenChange={setCueListOpen}
        stackName={stack?.name ?? ''}
        cues={cues}
        activeCueId={display.activeCueId}
        standbyCueId={display.standbyCueId}
        completedCueIds={display.completedCueIds}
        fadeProgress={display.fadeProgress ?? 0}
        autoProgress={display.autoProgress}
        // Q-numbers and notes always render now that the Theatre/Band toggle
        // is gone — pass true so MobileCueListSheet doesn't hide them.
        isTheatre={true}
        onSelectCue={handleSelectCueFromList}
      />
    </div>
  )
}

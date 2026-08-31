import { useState, useCallback, useMemo } from 'react'
import { ArrowLeft, ChevronDown, List, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SpeedMastersChip } from '../../SpeedMasters'
import { StackPickerSheet } from '../StackPickerSheet'
import { MobileCueListSheet } from '../MobileCueListSheet'
import { RunMobileCueCard, type MobileExpansion } from './RunMobileCueCard'
import type { CueStack, CueStackCueEntry } from '@/api/cueStacksApi'

/**
 * The **phone runner**: the takeover layout Show swaps to below 600px, always locked.
 *
 * This directory was `runner/run/` — "the Run view's components" — until session 2b folded Run
 * into Show and everything shared with the desktop view moved up into `runner/`. What is left is
 * only the phone layout, which is what `runner/mobile/` is now named for.
 */
export interface RunnerDisplayState {
  activeCue: CueStackCueEntry | null
  standbyCue: CueStackCueEntry | null
  nextStack: CueStack | null
  activeCueId: number | null
  standbyCueId: number | null
  completedCueIds: number[]
}

interface RunMobileProps {
  stacks: CueStack[]
  selectedStackId: number | null
  stack: CueStack | undefined
  /** When false (single-stack show), the stack name is a plain label — no picker. */
  multiStack: boolean
  display: RunnerDisplayState
  dbo: boolean
  onGo: () => void
  onBack: () => void
  onDbo: () => void
  onSelectStack: (stack: CueStack) => void
  onRequeueCue: (cueId: number) => void
  projectId: number
  /** The live stack id, or null off the playhead — gates the Current card's and the cue-list
   *  sheet's own `useCueFade` subscriptions (see `useCueFade`). */
  fadeStackId: number | null
  /** Prompt-book reading position of the active / next cue, e.g. "top of p. 9". */
  activeLocation: string | null
  standbyLocation: string | null
}

/**
 * Mobile takeover for the Run view. Replaces the previous `ShowRunnerMobile`
 * hero-and-standby layout with the Run-redesign's stacked Current + Next cards
 * (each with an internal Stage / Details toggle), a bottom-sheet picker for
 * re-queueing, and a fixed BACK + GO transport.
 */
export function RunMobile({
  stacks,
  selectedStackId,
  stack,
  multiStack,
  display,
  dbo,
  onGo,
  onBack,
  onDbo,
  onSelectStack,
  onRequeueCue,
  projectId,
  fadeStackId,
  activeLocation,
  standbyLocation,
}: RunMobileProps) {
  const cues = useMemo<CueStackCueEntry[]>(() => stack?.cues ?? [], [stack?.cues])
  const [stackPickerOpen, setStackPickerOpen] = useState(false)
  const [cueListOpen, setCueListOpen] = useState(false)
  const [expansion, setExpansion] = useState<MobileExpansion | null>({
    card: 'cur',
    mode: 'stage',
  })

  const { activeCue, standbyCue, nextStack } = display

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

  const goLabel = standbyCue || nextStack ? 'GO' : 'END'
  const goDisabled = !standbyCue && !nextStack

  return (
    <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
      {/* Top strip */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b bg-card px-2">
        {multiStack ? (
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
        ) : (
          <div className="flex items-center gap-1 h-9 px-2 min-w-0 max-w-[45%]">
            <span className="truncate text-sm font-medium">
              {stack?.name ?? 'No stack'}
            </span>
            {stack?.loop && (
              <RotateCcw className="size-3 shrink-0 text-muted-foreground" />
            )}
          </div>
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setCueListOpen(true)}
          aria-label="Open cue list"
        >
          <List className="size-4" />
        </Button>

        <div className="flex-1" />

        {/* Every master, master 1 included. This used to be a hand-rolled M1 readout + TAP beside
            a strip that deliberately excluded M1, so the two disagreed about what "the tempo" meant
            and neither could tap anything but master 1. Asked for by name rather than by a `compact`
            prop because RunMobile has no `@container` ancestor for the chip to choose itself. */}
        <SpeedMastersChip />

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
          fadeStackId={fadeStackId}
          location={activeLocation}
        />
        <RunMobileCueCard
          kind="nxt"
          cue={standbyCue}
          projectId={projectId}
          expansion={expansion}
          onSetExpansion={setExpansion}
          onChange={() => setCueListOpen(true)}
          location={standbyLocation}
        />

        {!standbyCue && nextStack && (
          <div className="rounded-lg border border-blue-900/60 bg-blue-950/20 px-3 py-2 text-sm text-blue-300 italic">
            End of stack — next stack: {nextStack.name}
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
      {multiStack && (
        <StackPickerSheet
          open={stackPickerOpen}
          onOpenChange={setStackPickerOpen}
          stacks={stacks}
          selectedStackId={selectedStackId}
          onSelectStack={onSelectStack}
        />
      )}
      <MobileCueListSheet
        open={cueListOpen}
        onOpenChange={setCueListOpen}
        stackName={stack?.name ?? ''}
        cues={cues}
        activeCueId={display.activeCueId}
        standbyCueId={display.standbyCueId}
        completedCueIds={display.completedCueIds}
        fadeStackId={fadeStackId}
        // Q-numbers and notes always render now that the Theatre/Band toggle
        // is gone — pass true so MobileCueListSheet doesn't hide them.
        isTheatre={true}
        onSelectCue={handleSelectCueFromList}
      />
    </div>
  )
}

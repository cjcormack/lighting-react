import { useState, useCallback, useRef, useEffect } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Drama,
  List,
  Music,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatFadeText } from '@/lib/cueUtils'
import { StackPickerSheet } from './StackPickerSheet'
import { MobileCueListSheet } from './MobileCueListSheet'
import type { ShowDetails, ShowEntryDto } from '@/api/showApi'
import type { CueStack, CueStackCueEntry } from '@/api/cueStacksApi'

export interface RunnerDisplayState {
  activeCue: CueStackCueEntry | null
  standbyCue: CueStackCueEntry | null
  nextStackEntry: ShowEntryDto | null
  fadeProgress: number
  autoProgress: number | null
  activeCueId: number | null
  standbyCueId: number | null
  completedCueIds: number[]
}

interface ShowRunnerMobileProps {
  show: ShowDetails
  activeEntryId: number | null
  stack: CueStack | undefined
  stackMap: Map<number, CueStack>
  display: RunnerDisplayState
  bpm: number | null
  dbo: boolean
  isTheatre: boolean
  onGo: () => void
  onBack: () => void
  onDbo: () => void
  onTap: () => void
  onSwitchToEntry: (entry: ShowEntryDto) => void
  onToggleCtx: (val: 'theatre' | 'band') => void
  onOpenCueForm: (stackId: number, cueId: number) => void
}

export function ShowRunnerMobile({
  show,
  activeEntryId,
  stack,
  stackMap,
  display,
  bpm,
  dbo,
  isTheatre,
  onGo,
  onBack,
  onDbo,
  onTap,
  onSwitchToEntry,
  onToggleCtx,
  onOpenCueForm,
}: ShowRunnerMobileProps) {
  const cues = stack?.cues ?? []
  const [stackPickerOpen, setStackPickerOpen] = useState(false)
  const [cueListOpen, setCueListOpen] = useState(false)
  const pendingCueFormTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => clearTimeout(pendingCueFormTimer.current)
  }, [])

  const { activeCue, standbyCue, nextStackEntry, fadeProgress, autoProgress } = display

  // Delay opening CueForm until the cue-list sheet finishes its 300ms close animation
  // so two Dialogs don't trap focus simultaneously.
  const handleSelectCueFromList = useCallback(
    (cueId: number) => {
      if (stack == null) return
      const stackId = stack.id
      setCueListOpen(false)
      clearTimeout(pendingCueFormTimer.current)
      pendingCueFormTimer.current = setTimeout(() => {
        onOpenCueForm(stackId, cueId)
      }, 320)
    },
    [stack, onOpenCueForm],
  )

  const heroFadeText = activeCue
    ? formatFadeText(activeCue.fadeDurationMs, activeCue.fadeCurve)
    : ''

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

        {/* BPM + TAP */}
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs text-muted-foreground tabular-nums min-w-8 text-right">
            {bpm ?? '\u2014'}
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

        {/* DBO */}
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

        {/* Theatre / Band toggle */}
        <Tabs
          value={isTheatre ? 'theatre' : 'band'}
          onValueChange={(v) => onToggleCtx(v as 'theatre' | 'band')}
          className="w-auto"
        >
          <TabsList className="h-8 p-[2px]">
            <TabsTrigger
              value="theatre"
              className="px-2 py-0"
              aria-label="Theatre mode"
            >
              <Drama className="size-3.5" />
            </TabsTrigger>
            <TabsTrigger
              value="band"
              className="px-2 py-0"
              aria-label="Band mode"
            >
              <Music className="size-3.5" />
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Active cue hero */}
      <div className="flex-1 flex flex-col items-stretch justify-center gap-4 px-6 py-6 min-h-0">
        {activeCue ? (
          <>
            {isTheatre && activeCue.cueNumber && (
              <div className="text-center font-mono text-sm text-muted-foreground">
                Q{activeCue.cueNumber}
              </div>
            )}
            <div className="text-center text-3xl font-semibold text-amber-400 break-words leading-tight">
              {activeCue.name}
            </div>
            <div className="space-y-1.5">
              <div className="relative h-2 rounded overflow-hidden bg-muted">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-700 to-amber-400 shadow-[0_0_10px_rgba(240,160,48,0.55)] transition-[width]"
                  style={{ width: `${(fadeProgress * 100).toFixed(2)}%` }}
                />
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{heroFadeText}</span>
                {activeCue.autoAdvance && (
                  <Badge
                    variant="outline"
                    className="text-[10px] border-blue-500/30 text-blue-500 bg-blue-500/10 rounded-sm px-1.5 py-0"
                  >
                    Auto
                  </Badge>
                )}
              </div>
              {autoProgress != null && (
                <div className="relative h-1 rounded overflow-hidden bg-muted">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-700 to-blue-400"
                    style={{ width: `${(autoProgress * 100).toFixed(2)}%` }}
                  />
                </div>
              )}
              {activeCue.notes && isTheatre && (
                <div className="text-center text-xs italic text-muted-foreground pt-1">
                  {activeCue.notes}
                </div>
              )}
            </div>
          </>
        ) : standbyCue ? (
          <div className="text-center space-y-1">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Ready
            </div>
            <div className="text-xl text-muted-foreground">
              Press GO to fire
            </div>
          </div>
        ) : (
          <div className="text-center space-y-1">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Idle
            </div>
            <div className="text-xl text-muted-foreground">
              End of stack
            </div>
          </div>
        )}
      </div>

      {/* Standby / boundary card */}
      <div className="border-t px-4 py-3 bg-card/30 shrink-0">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
          {nextStackEntry ? 'Next stack' : 'Next'}
        </div>
        {standbyCue ? (
          <div className="flex items-baseline gap-2">
            {isTheatre && standbyCue.cueNumber && (
              <span className="font-mono text-xs text-green-600 shrink-0">
                Q{standbyCue.cueNumber}
              </span>
            )}
            <span className="flex-1 text-base font-semibold text-green-500 truncate">
              {standbyCue.name}
            </span>
            {standbyCue.autoAdvance && (
              <Badge
                variant="outline"
                className="text-[10px] border-blue-500/30 text-blue-500 bg-blue-500/10 rounded-sm px-1.5 py-0 shrink-0"
              >
                Auto
              </Badge>
            )}
          </div>
        ) : nextStackEntry ? (
          <div className="flex items-center gap-2">
            <ArrowRight className="size-4 shrink-0 text-green-500" />
            <span className="flex-1 text-base font-semibold text-green-500 truncate">
              {nextStackEntry.cueStackName}
            </span>
          </div>
        ) : (
          <div className="text-base italic text-muted-foreground">
            End of show
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
        fadeProgress={display.fadeProgress}
        autoProgress={display.autoProgress}
        isTheatre={isTheatre}
        onSelectCue={handleSelectCueFromList}
      />
    </div>
  )
}

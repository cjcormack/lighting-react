import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { MarkerRow } from './MarkerRow'
import { MobileCueRow } from './MobileCueRow'
import type { CueStackCueEntry } from '@/api/cueStacksApi'

interface MobileCueListSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stackName: string
  cues: CueStackCueEntry[]
  activeCueId: number | null
  standbyCueId: number | null
  completedCueIds: number[]
  fadeProgress: number
  autoProgress: number | null
  isTheatre: boolean
  onSelectCue: (cueId: number) => void
}

export function MobileCueListSheet({
  open,
  onOpenChange,
  stackName,
  cues,
  activeCueId,
  standbyCueId,
  completedCueIds,
  fadeProgress,
  autoProgress,
  isTheatre,
  onSelectCue,
}: MobileCueListSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[70dvh] p-0 gap-0"
      >
        <SheetHeader className="border-b">
          <SheetTitle className="truncate pr-8">
            {stackName || 'Cue list'}
          </SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto">
          {cues.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              This stack has no cues.
            </div>
          ) : (
            cues.map((cue) => {
              if (cue.cueType === 'MARKER') {
                return <MarkerRow key={cue.id} name={cue.name} />
              }
              const isActive = cue.id === activeCueId
              const isStandby = cue.id === standbyCueId
              const isDone = completedCueIds.includes(cue.id)
              return (
                <MobileCueRow
                  key={cue.id}
                  cueNumber={cue.cueNumber}
                  name={cue.name}
                  fadeDurationMs={cue.fadeDurationMs}
                  fadeCurve={cue.fadeCurve}
                  autoAdvance={cue.autoAdvance}
                  isActive={isActive}
                  isStandby={isStandby}
                  isDone={isDone}
                  isTheatre={isTheatre}
                  fadeProgress={isActive ? fadeProgress : 0}
                  autoProgress={isActive ? autoProgress : null}
                  onClick={() => onSelectCue(cue.id)}
                />
              )
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

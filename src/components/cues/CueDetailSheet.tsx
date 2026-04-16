import {
  Sheet,
  SheetContent,
  SheetBody,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Pencil } from 'lucide-react'
import { CueDetailContent } from './CueDetailContent'
import type { Cue } from '@/api/cuesApi'

// ── Sheet ──────────────────────────────────────────────────────────────

interface CueDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cue: Cue | null
  projectId: number
  /** Optional callback to jump into the edit form from the detail view. */
  onEdit?: () => void
}

/**
 * Read-only view of a cue — a lighter-weight companion to `CueForm` for
 * operators who want to inspect a cue without risking an accidental edit.
 * Shares the same summary components (PresetApplicationSummary, EffectSummary,
 * TriggerSummary) so the layout matches what the editor shows.
 */
export function CueDetailSheet({
  open,
  onOpenChange,
  cue,
  projectId,
  onEdit,
}: CueDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col sm:max-w-lg">
        <SheetHeader className="pr-10">
          <SheetTitle className="flex items-center gap-2">
            {cue?.name ?? 'Cue details'}
            {cue?.cueNumber && (
              <Badge variant="outline" className="font-mono text-xs">
                Q{cue.cueNumber}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>Read-only view. Click Edit to make changes.</SheetDescription>
        </SheetHeader>

        <SheetBody>
          <CueDetailContent cue={cue} projectId={projectId} enabled={open} />
        </SheetBody>

        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {onEdit && (
            <Button onClick={onEdit}>
              <Pencil className="size-3.5 mr-1.5" />
              Edit
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from '@/components/ui/sheet'
import { CueTargetPicker } from '@/components/cues/CueTargetPicker'
import { usePatchProjectCueMutation } from '@/store/cues'
import { buildCueInput } from '@/lib/cueUtils'
import { collectCueTargets, targetEquals } from './targetUtils'
import type { Cue, CueTarget } from '@/api/cuesApi'

interface AddTargetSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cue: Cue
  projectId: number
}

/**
 * Right-hand sheet for adding a target to the cue. Targets aren't first-class
 * in the data model, so we materialise them by writing a `dimmer = 0`
 * placeholder property assignment — the target appears in the union and the
 * user can refine the assignment from the Layers pane.
 *
 * If the target already exists on the cue (already has any
 * assignment/effect/preset reference), selecting it just closes the sheet.
 */
export function AddTargetSheet({
  open,
  onOpenChange,
  cue,
  projectId,
}: AddTargetSheetProps) {
  const [patchCue] = usePatchProjectCueMutation()

  const handleSelect = (target: CueTarget) => {
    const existing = collectCueTargets(cue)
    if (existing.some((t) => targetEquals(t, target))) {
      onOpenChange(false)
      return
    }
    const input = buildCueInput(cue)
    patchCue({
      projectId,
      cueId: cue.id,
      propertyAssignments: [
        ...(input.propertyAssignments ?? []),
        {
          targetType: target.type,
          targetKey: target.key,
          propertyName: 'dimmer',
          value: '0',
        },
      ],
    })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-md flex flex-col p-0"
      >
        <SheetHeader className="border-b">
          <SheetTitle>Add target</SheetTitle>
          <SheetDescription>
            Choose a group or fixture to give this cue something to act on.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="px-0 pt-0">
          <CueTargetPicker onSelect={handleSelect} />
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

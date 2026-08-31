import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { LayerPicker } from './LayerPicker'
import type { CueLayer, CueTarget } from '@/api/cuesApi'

interface AddLayerSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  defaultTarget: CueTarget | null
  onAdd: (layer: CueLayer) => void
  /**
   * Passed straight to [LayerPicker]. The programmer sets it false — it has no playback to delay
   * against, and it drops the timing fields on the way out.
   */
  allowTiming?: boolean
}

/**
 * Right-hand sheet wrapping `LayerPicker`.
 *
 * Lives beside the picker rather than in the cue editor because both the cue editor and the
 * programmer open it: a layer means the same thing in either stack, so "add a layer" is one
 * gesture with one sheet.
 */
export function AddLayerSheet({
  open,
  onOpenChange,
  projectId,
  defaultTarget,
  onAdd,
  allowTiming = true,
}: AddLayerSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Add layer</SheetTitle>
        </SheetHeader>
        {open && (
          <LayerPicker
            projectId={projectId}
            preselectedTarget={defaultTarget}
            onConfirm={onAdd}
            onCancel={() => onOpenChange(false)}
            allowTiming={allowTiming}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

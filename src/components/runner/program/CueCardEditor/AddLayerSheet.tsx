import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { LayerPicker } from '@/components/cues/editor/LayerPicker'
import type { CueLayer, CueTarget } from '@/api/cuesApi'

interface AddLayerSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  defaultTarget: CueTarget | null
  onAdd: (layer: CueLayer) => void
}

/** Right-hand sheet wrapping `LayerPicker`. */
export function AddLayerSheet({
  open,
  onOpenChange,
  projectId,
  defaultTarget,
  onAdd,
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
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { PresetPicker } from '@/components/cues/editor/PresetPicker'
import type { CueTarget } from '@/api/cuesApi'

interface AddPresetSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  defaultTarget: CueTarget | null
  onAdd: (
    presetId: number,
    targets: CueTarget[],
    timing: { delayMs?: number | null; intervalMs?: number | null; randomWindowMs?: number | null },
  ) => void
}

/** Right-hand sheet wrapping `PresetPicker`. */
export function AddPresetSheet({
  open,
  onOpenChange,
  projectId,
  defaultTarget,
  onAdd,
}: AddPresetSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-lg flex flex-col p-0"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Add preset</SheetTitle>
        </SheetHeader>
        {open && (
          <PresetPicker
            projectId={projectId}
            preselectedTarget={defaultTarget}
            onConfirm={(app) => {
              onAdd(app.presetId, app.targets, {
                delayMs: app.delayMs,
                intervalMs: app.intervalMs,
                randomWindowMs: app.randomWindowMs,
              })
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

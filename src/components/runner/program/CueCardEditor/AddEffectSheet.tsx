import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { EffectFlow } from '@/components/cues/editor/EffectFlow'
import type { CueAdHocEffect, CueTarget } from '@/api/cuesApi'

interface AddEffectSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultTarget: CueTarget | null
  palette: string[]
  onAdd: (effect: CueAdHocEffect) => void
}

/** Right-hand sheet wrapping `EffectFlow`. */
export function AddEffectSheet({
  open,
  onOpenChange,
  defaultTarget,
  palette,
  onAdd,
}: AddEffectSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-lg flex flex-col p-0"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Add effect</SheetTitle>
        </SheetHeader>
        {open && (
          <EffectFlow
            preselectedTarget={defaultTarget}
            palette={palette}
            onConfirm={(effects) => {
              for (const e of effects) onAdd(e)
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

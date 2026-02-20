import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { Loader2 } from 'lucide-react'
import { CuePaletteEditor } from './CuePaletteEditor'
import type { CueStack, CueStackInput } from '@/api/cueStacksApi'

interface CueStackFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stack: CueStack | null
  onSave: (input: CueStackInput) => Promise<void>
  isSaving: boolean
}

export function CueStackForm({
  open,
  onOpenChange,
  stack,
  onSave,
  isSaving,
}: CueStackFormProps) {
  const [name, setName] = useState('')
  const [palette, setPalette] = useState<string[]>([])
  const [loop, setLoop] = useState(false)

  useEffect(() => {
    if (open) {
      if (stack) {
        setName(stack.name)
        setPalette([...stack.palette])
        setLoop(stack.loop)
      } else {
        setName('')
        setPalette([])
        setLoop(false)
      }
    }
  }, [open, stack])

  const handleSave = async () => {
    const input: CueStackInput = {
      name: name.trim(),
      palette,
      loop,
    }
    await onSave(input)
    onOpenChange(false)
  }

  const isValid = name.trim().length > 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{stack ? 'Edit Cue Stack' : 'New Cue Stack'}</SheetTitle>
          <SheetDescription>
            {stack
              ? 'Update stack settings.'
              : 'Create a stack to group cues for sequential playback.'}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="stack-name">Name</Label>
            <Input
              id="stack-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Act 1"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isValid) handleSave()
              }}
            />
          </div>

          {/* Palette */}
          <div className="space-y-1.5">
            <Label>Stack Palette</Label>
            <p className="text-xs text-muted-foreground">
              Base palette for cues in this stack. Cue palettes override when set.
            </p>
            <CuePaletteEditor palette={palette} onChange={setPalette} />
          </div>

          {/* Loop */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Loop</Label>
              <p className="text-xs text-muted-foreground">Wrap from last cue to first</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={loop}
              onClick={() => setLoop(!loop)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                loop ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`pointer-events-none inline-block size-5 rounded-full bg-background shadow-lg transition-transform ${
                  loop ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            Auto-advance and crossfade are configured per-cue in the cue editor.
          </p>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid || isSaving}>
            {isSaving && <Loader2 className="size-4 mr-2 animate-spin" />}
            {stack ? 'Save' : 'Create'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

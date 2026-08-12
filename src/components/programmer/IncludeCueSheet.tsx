import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, XCircle } from 'lucide-react'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatError } from '@/lib/formatError'
import { useProjectCueStackListQuery } from '@/store/cueStacks'
import { AUTO_CUE_NUMBER_CLASS } from '@/lib/cueNumber'
import { useIncludeCue } from './useIncludeCue'
import { MaskPicker } from './maskPicker'
import type { PropertyMaskGroup } from '@/store/programmerOps'

export interface IncludeCueSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
}

/**
 * Pick a cue to Include. Reached from the programmer toolbar; the Program view includes
 * straight from the cue row it is already showing, so it doesn't need this picker.
 */
export function IncludeCueSheet({ open, onOpenChange, projectId }: IncludeCueSheetProps) {
  const { data: stacks } = useProjectCueStackListQuery(projectId)
  const { include, isLoading, error, result, resetInclude } = useIncludeCue(projectId, { toastErrors: false })

  const [filter, setFilter] = useState('')
  const [mask, setMask] = useState<PropertyMaskGroup[]>([])

  // Once per open — `resetInclude` closes over RTK Query's `reset`, whose identity changes
  // with the mutation's state, so re-running on its identity would clear the "Included …"
  // confirmation the moment it appeared.
  const openedRef = useRef(false)
  useEffect(() => {
    if (!open) {
      openedRef.current = false
      return
    }
    if (openedRef.current) return
    openedRef.current = true
    setFilter('')
    setMask([])
    resetInclude()
  }, [open, resetInclude])

  const matches = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return (stacks ?? [])
      .filter((stack) => stack.type !== 'SEPARATOR')
      .map((stack) => ({
        stack,
        cues: (stack.cues ?? []).filter(
          (cue) =>
            needle === '' ||
            cue.name.toLowerCase().includes(needle) ||
            (cue.cueNumber ?? '').toLowerCase().includes(needle) ||
            stack.name.toLowerCase().includes(needle),
        ),
      }))
      .filter((entry) => entry.cues.length > 0)
  }, [stacks, filter])

  return (
    <Sheet open={open} onOpenChange={(next) => !isLoading && onOpenChange(next)}>
      <SheetContent className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Include</SheetTitle>
          <SheetDescription>
            Load a cue’s values and effects into the programmer, then edit them on stage and
            press Update.
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter cues"
            aria-label="Filter cues"
          />

          <MaskPicker value={mask} onChange={setMask} />

          {error != null && (
            <Alert variant="destructive">
              <XCircle className="size-4" />
              <AlertDescription>{formatError(error)}</AlertDescription>
            </Alert>
          )}

          {result && (
            <Alert>
              <AlertDescription>
                Included “{result.cueName}” — {result.entriesWritten} value
                {result.entriesWritten === 1 ? '' : 's'}
                {result.fxSpawned > 0 ? `, ${result.fxSpawned} effect(s)` : ''}
                {result.fxAlreadyRunning > 0
                  ? `. ${result.fxAlreadyRunning} effect(s) were already running on stage.`
                  : '.'}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            {matches.map(({ stack, cues }) => (
              <div key={stack.id} className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{stack.name}</p>
                {cues.map((cue) => (
                  <button
                    key={cue.id}
                    type="button"
                    disabled={isLoading}
                    onClick={() => include(cue.id, mask)}
                    className="flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                  >
                    {cue.cueNumber && (
                      <span
                        className={cn(
                          'w-14 shrink-0 tabular-nums text-xs',
                          cue.cueNumberAuto && AUTO_CUE_NUMBER_CLASS,
                        )}
                      >
                        {cue.cueNumber}
                      </span>
                    )}
                    <span className="truncate">{cue.name}</span>
                  </button>
                ))}
              </div>
            ))}
            {matches.length === 0 && (
              <p className="text-sm text-muted-foreground">No cues match.</p>
            )}
          </div>
        </SheetBody>

        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {isLoading && (
            <Button disabled>
              <Loader2 className="size-4 animate-spin" />
              Including…
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

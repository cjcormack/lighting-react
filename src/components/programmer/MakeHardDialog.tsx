import { useEffect, useState } from 'react'
import { Loader2, XCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { formatError } from '@/lib/formatError'
import { useMakeProgrammerHardMutation } from '@/store/programmerOps'

export interface MakeHardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** How many references the programmer currently holds, for the confirmation's count. */
  referenceCount: number
}

/**
 * Stop the **programmer's** references tracking their Looks, replacing each with the literal it
 * currently resolves to.
 *
 * A **Dialog**, not a Sheet, per this repo's convention: there is nothing to fill in — it is a
 * confirmation with a count. Nothing on stage moves, which is worth saying out loud, because "make
 * hard" sounds like it should do something visible and an operator who expects a change and sees
 * none will press it again.
 *
 * Once three scopes, now one. The per-cue and per-preset routes are gone: layers replace value-level
 * references, so "flatten this layer into local rows" is the gesture that supersedes them, and it
 * arrives with the programmer rewrite. The programmer scope survives because references still exist
 * — migrated cues hold them, and Include-a-cue stages them — and this is the only way out of one.
 */
export function MakeHardDialog({ open, onOpenChange, referenceCount }: MakeHardDialogProps) {
  const [makeProgrammerHard, { isLoading, error, reset }] = useMakeProgrammerHardMutation()
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDone(null)
      // The mutation hook owns its `error` and keeps it across an open/close cycle, so without
      // this a failed attempt's alert greets the operator on the *next* open, before they have
      // pressed anything.
      reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reset`'s identity is stable
  }, [open])

  const submit = async () => {
    const result = await makeProgrammerHard({})
      .unwrap()
      .catch(() => null)
    if (result == null) return
    setDone(
      `${result.converted} reference${result.converted === 1 ? '' : 's'} replaced with fixed values` +
        (result.skipped > 0 ? `, ${result.skipped} left alone.` : '.'),
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isLoading && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make hard</DialogTitle>
          <DialogDescription>
            Replace the programmer&rsquo;s {referenceCount} reference
            {referenceCount === 1 ? '' : 's'} with the values they currently resolve to.
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Nothing on stage moves — each reference keeps the value it already had. What changes is
          the future: these values stop following the look they came from, so editing it will no
          longer move them.
        </p>

        {error != null && (
          <Alert variant="destructive">
            <XCircle className="size-4" />
            <AlertDescription>{formatError(error)}</AlertDescription>
          </Alert>
        )}

        {done && (
          <Alert>
            <AlertDescription>{done}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            {done ? 'Close' : 'Cancel'}
          </Button>
          <Button onClick={submit} disabled={isLoading || done != null}>
            {isLoading && <Loader2 className="size-4 animate-spin" />}
            Make hard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

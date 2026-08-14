import { useEffect, useState } from 'react'
import { Loader2, TriangleAlert, XCircle } from 'lucide-react'
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
import { useMakeCueHardMutation, useMakeProgrammerHardMutation } from '@/store/programmerOps'
import type { ProgrammerConflict } from '@/store/programmerOps'

/**
 * Which references to harden. The two scopes differ in more than a URL: the programmer's are
 * live values that nothing has persisted yet, the cue's are stored rows — which is why only the
 * cue scope can collide with an open cue-edit session.
 */
export type MakeHardScope =
  | { kind: 'programmer'; referenceCount: number }
  | {
      kind: 'cue'
      cueId: number
      cueName: string
      referenceCount: number
      /**
       * A cue-edit session is already open on this cue. The backend refuses to harden underneath
       * one unless forced, because the session's Discard would revert the write — so the caller
       * says up front when it knows, and the dialog asks the real question once instead of
       * spending the first click on a guaranteed 409.
       */
      editSessionOpen?: boolean
    }

export interface MakeHardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  scope: MakeHardScope
}

/**
 * Stop references tracking their palettes, replacing each with the literal it currently resolves
 * to.
 *
 * A **Dialog**, not a Sheet, per this repo's convention: there is nothing to fill in — it is a
 * confirmation with counts. Nothing on stage moves, which is worth saying out loud, because
 * "make hard" sounds like it should do something visible and an operator who expects a change
 * and sees none will press it again.
 */
export function MakeHardDialog({ open, onOpenChange, projectId, scope }: MakeHardDialogProps) {
  const [makeProgrammerHard, programmerState] = useMakeProgrammerHardMutation()
  const [makeCueHard, cueState] = useMakeCueHardMutation()
  const [conflict, setConflict] = useState<ProgrammerConflict | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const isLoading = programmerState.isLoading || cueState.isLoading
  const error = scope.kind === 'programmer' ? programmerState.error : cueState.error

  useEffect(() => {
    if (open) {
      setConflict(null)
      setDone(null)
    }
  }, [open])

  // Expanding a cue card *is* what opens its edit session, and the cue-level button lives in
  // that card's footer — so from there the unforced call could never succeed.
  const sessionOpen = scope.kind === 'cue' && scope.editSessionOpen === true

  const submit = async (force: boolean) => {
    setConflict(null)
    try {
      if (scope.kind === 'programmer') {
        const result = await makeProgrammerHard({}).unwrap()
        setDone(
          `${result.converted} reference${result.converted === 1 ? '' : 's'} replaced with fixed values` +
            (result.skipped > 0 ? `, ${result.skipped} left alone.` : '.'),
        )
        return
      }
      const result = await makeCueHard({ projectId, cueId: scope.cueId, force }).unwrap()
      const notes = [
        `${result.converted} row${result.converted === 1 ? '' : 's'} hardened`,
        // Worth its own clause: a group row whose members resolved differently becomes one row
        // per member, so the cue's row count grows and the card looks different afterwards.
        result.groupRowsExpanded > 0
          ? `${result.groupRowsExpanded} group row(s) expanded to per-fixture rows`
          : '',
        result.unresolved > 0 ? `${result.unresolved} left as references (they don’t resolve)` : '',
        result.republishedLive ? 'the live cue was republished' : '',
      ].filter(Boolean)
      setDone(`${notes.join(' · ')}.`)
    } catch (err) {
      const body = (err as { data?: ProgrammerConflict })?.data
      if (body?.code === 'CUE_EDIT_SESSION_OPEN') setConflict(body)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isLoading && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make hard</DialogTitle>
          <DialogDescription>
            {scope.kind === 'programmer'
              ? `Replace the programmer’s ${scope.referenceCount} palette reference${
                  scope.referenceCount === 1 ? '' : 's'
                } with the values they currently resolve to.`
              : `Replace “${scope.cueName}”’s ${scope.referenceCount} palette reference${
                  scope.referenceCount === 1 ? '' : 's'
                } with the values they currently resolve to.`}
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Nothing on stage moves — each reference keeps the value it already had. What changes is
          the future: these values stop following the palette, so editing it will no longer move
          them.
        </p>

        {sessionOpen && !conflict && !done && (
          <Alert>
            <TriangleAlert className="size-4" />
            {/* No <strong> here: AlertDescription lays its children out as grid rows, so an
                inline emphasis element breaks the sentence onto three lines. */}
            <AlertDescription>
              You have this cue open for editing. Hardening now is fine, but pressing Discard on
              the cue afterwards would revert it along with your other edits.
            </AlertDescription>
          </Alert>
        )}

        {conflict && (
          <Alert variant="destructive">
            <XCircle className="size-4" />
            <AlertDescription className="space-y-2">
              <p>{conflict.error}</p>
              <Button
                size="sm"
                variant="outline"
                disabled={isLoading}
                onClick={() => submit(true)}
              >
                Make hard anyway
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {error != null && !conflict && (
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
          <Button onClick={() => submit(sessionOpen)} disabled={isLoading || done != null}>
            {isLoading && <Loader2 className="size-4 animate-spin" />}
            Make hard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

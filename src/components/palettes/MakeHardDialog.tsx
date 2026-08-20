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
import {
  useMakeCueHardMutation,
  useMakeFxPresetHardMutation,
  useMakeProgrammerHardMutation,
} from '@/store/programmerOps'
import type { PresetRefAmbiguity, ProgrammerConflict } from '@/store/programmerOps'
import type { FxPreset } from '@/api/fxPresetsApi'

/**
 * Which references to harden. The three scopes differ in more than a URL: the programmer's are
 * live values that nothing has persisted yet, the cue's are stored rows — which is why only the
 * cue scope can collide with an open cue-edit session — and the preset's are stored rows with no
 * target, which is why only the preset scope can come back ambiguous.
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
  | {
      kind: 'preset'
      presetId: number
      presetName: string
      referenceCount: number
      /** Harden only rows referencing this palette. Set when entered from a palette. */
      paletteUuid?: string
      /**
       * The preset as it stands after a successful harden.
       *
       * Callers holding the preset in local state (the editor takes a snapshot when the row is
       * opened) cannot see the write any other way: invalidating the cache refetches the list,
       * but a frozen snapshot never re-reads it. The response already carries the new rows, so
       * hand them over rather than hoping for a refetch.
       */
      onHardened?: (preset: FxPreset) => void
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
  const [makePresetHard, presetState] = useMakeFxPresetHardMutation()
  const [conflict, setConflict] = useState<ProgrammerConflict | null>(null)
  const [ambiguous, setAmbiguous] = useState<PresetRefAmbiguity[]>([])
  const [done, setDone] = useState<string | null>(null)

  const isLoading = programmerState.isLoading || cueState.isLoading || presetState.isLoading
  const error =
    scope.kind === 'programmer'
      ? programmerState.error
      : scope.kind === 'cue'
        ? cueState.error
        : presetState.error

  useEffect(() => {
    if (open) {
      setConflict(null)
      setAmbiguous([])
      setDone(null)
      // The mutation hooks own their `error` and keep it across an open/close cycle. The preset
      // banner holds one dialog instance for a whole editing session, so without these a failed
      // attempt's alert greets the operator on the *next* open, before they've pressed anything.
      programmerState.reset()
      cueState.reset()
      presetState.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the `reset` identities are stable
  }, [open])

  // Expanding a cue card *is* what opens its edit session, and the cue-level button lives in
  // that card's footer — so from there the unforced call could never succeed.
  const sessionOpen = scope.kind === 'cue' && scope.editSessionOpen === true

  const submit = async (force: boolean) => {
    setConflict(null)
    setAmbiguous([])
    try {
      if (scope.kind === 'preset') {
        const result = await makePresetHard({
          projectId,
          presetId: scope.presetId,
          ...(scope.paletteUuid ? { paletteUuids: [scope.paletteUuid] } : {}),
        }).unwrap()
        // Ambiguity is part of a 200, not a failure — so both halves are reported together and
        // `ambiguous` renders even when `converted` is 0.
        setAmbiguous(result.ambiguous)
        if (result.converted > 0) scope.onHardened?.(result.preset)
        const notes = [
          `${result.converted} row${result.converted === 1 ? '' : 's'} hardened`,
          result.ambiguous.length > 0
            ? `${result.ambiguous.length} left as reference${result.ambiguous.length === 1 ? '' : 's'} — see below`
            : '',
          result.unresolved > 0
            ? `${result.unresolved} left as references (they don’t resolve)`
            : '',
          result.cuesRepublished.length > 0
            ? `${result.cuesRepublished.length} live cue(s) republished`
            : '',
        ].filter(Boolean)
        setDone(`${notes.join(' · ')}.`)
        return
      }
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
          <DialogDescription>{describeScope(scope)}</DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Nothing on stage moves — each reference keeps the value it already had. What changes is
          the future: these values stop following the palette, so editing it will no longer move
          them.
        </p>

        {scope.kind === 'preset' && (
          <p className="text-sm text-muted-foreground">
            A preset row has no target of its own — it applies wherever the preset is applied. So a
            row only hardens when the palette gives the same value to every fixture of this
            preset’s type; where it gives different fixtures different values, the row stays a
            reference and is listed below. One exception to “nothing moves”: a fixture the palette
            didn’t cover was being skipped, and will now take the hardened value.
          </p>
        )}

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

        {ambiguous.length > 0 && (
          <Alert>
            <TriangleAlert className="size-4" />
            <AlertDescription className="space-y-2">
              <p>
                {ambiguous.length} row{ambiguous.length === 1 ? '' : 's'} could not be hardened —
                the palette holds more than one value for them. Edit the palette so it agrees, or
                split the preset per fixture group.
              </p>
              <ul className="space-y-1.5">
                {ambiguous.map((row) => (
                  <li key={`${row.propertyName}:${row.paletteUuid}`} className="text-xs">
                    <span className="font-mono">{row.propertyName}</span>
                    {row.paletteName ? ` · ${row.paletteName}` : ''}
                    <ul className="mt-0.5 space-y-0.5 pl-3">
                      {row.variants.map((v) => (
                        <li key={v.literal} className="text-muted-foreground">
                          <span className="font-mono">{v.literal}</span> — {v.fixtureKeys.join(', ')}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </AlertDescription>
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

/**
 * One sentence naming what is about to be hardened. Split out because the three scopes have
 * nothing in common but the count, and a nested ternary in JSX reads worse than a switch.
 */
function describeScope(scope: MakeHardScope): string {
  const n = scope.referenceCount
  const refs = `${n} palette reference${n === 1 ? '' : 's'}`
  switch (scope.kind) {
    case 'programmer':
      return `Replace the programmer’s ${refs} with the values they currently resolve to.`
    case 'cue':
      return `Replace “${scope.cueName}”’s ${refs} with the values they currently resolve to.`
    case 'preset':
      return `Replace “${scope.presetName}”’s ${refs} with the values they currently resolve to.`
  }
}

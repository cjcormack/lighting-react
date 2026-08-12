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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatError } from '@/lib/formatError'
import { useProjectCueStackListQuery } from '@/store/cueStacks'
import { useRecordProgrammerMutation } from '@/store/programmerOps'
import type {
  ProgrammerConflict,
  PropertyMaskGroup,
  RecordMode,
  RecordResponse,
  RecordSource,
} from '@/store/programmerOps'
import { MaskPicker, describeSkips } from './maskPicker'

export interface RecordSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  /** Preselect a cue to record into — set when opened from a cue row. */
  targetCueId?: number
  targetCueName?: string
  /** Preselect a stack to create in. */
  defaultCueStackId?: number
}

const SOURCES: { value: RecordSource; label: string; hint: string }[] = [
  {
    value: 'TOUCHED',
    label: 'Programmer',
    hint: 'What you busked — the programmer values you edited.',
  },
  {
    value: 'ALL',
    label: 'Programmer + hand-downs',
    hint: 'Also captures unpark hand-downs the programmer is holding.',
  },
  {
    value: 'STAGE_SNAPSHOT',
    label: 'Whole stage',
    hint: 'Everything on stage, including values from other cues and running effects.',
  },
]

const MODES: { value: RecordMode; label: string; hint: string }[] = [
  { value: 'CREATE', label: 'New cue', hint: 'Add a new cue to a stack.' },
  { value: 'MERGE', label: 'Merge', hint: 'Add to the cue, keeping what it already has.' },
  {
    value: 'UPDATE_EXISTING',
    label: 'Replace',
    hint: 'Replace the cue’s values. Triggers and timed effects are kept.',
  },
  { value: 'REMOVE', label: 'Remove', hint: 'Delete the cue rows these fixtures name.' },
]

/**
 * Record the programmer into a cue.
 *
 * A Sheet rather than a Dialog per this repo's convention: mask + mode + target is a form,
 * not a confirmation. The result panel is deliberately chatty — a Record that quietly dropped
 * an element-keyed entry or masked half the rig out should say so, because the operator's
 * next move is to fire the cue and trust it.
 */
export function RecordSheet({
  open,
  onOpenChange,
  projectId,
  targetCueId,
  targetCueName,
  defaultCueStackId,
}: RecordSheetProps) {
  const { data: stacks } = useProjectCueStackListQuery(projectId)
  const [record, { isLoading, error, reset }] = useRecordProgrammerMutation()

  const [mode, setMode] = useState<RecordMode>(targetCueId ? 'MERGE' : 'CREATE')
  const [source, setSource] = useState<RecordSource>('TOUCHED')
  const [mask, setMask] = useState<PropertyMaskGroup[]>([])
  const [includeFx, setIncludeFx] = useState(true)
  const [stackId, setStackId] = useState<string>('')
  const [name, setName] = useState('')
  const [cueNumber, setCueNumber] = useState('')
  const [result, setResult] = useState<RecordResponse | null>(null)
  const [conflict, setConflict] = useState<ProgrammerConflict | null>(null)

  const recordableStacks = useMemo(
    () => (stacks ?? []).filter((stack) => stack.type !== 'SEPARATOR'),
    [stacks],
  )

  // Once per open. RTK Query's `reset` changes identity whenever the mutation's state does, so
  // an effect that depends on it *and* calls it re-fires — here that would wipe the result
  // panel and the operator's form the instant a Record completed.
  const openedRef = useRef(false)
  useEffect(() => {
    if (!open) {
      openedRef.current = false
      return
    }
    if (openedRef.current) return
    openedRef.current = true
    setMode(targetCueId ? 'MERGE' : 'CREATE')
    setSource('TOUCHED')
    setMask([])
    setIncludeFx(true)
    setName('')
    setCueNumber('')
    setStackId(String(defaultCueStackId ?? recordableStacks[0]?.id ?? ''))
    setResult(null)
    setConflict(null)
    reset()
    // recordableStacks is only read for its first id on open; re-running when the list
    // reloads would stomp a stack the operator had already picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetCueId, defaultCueStackId, reset])

  const creating = mode === 'CREATE'
  const canSubmit = creating ? stackId !== '' : targetCueId !== undefined

  const submit = async (force: boolean) => {
    setConflict(null)
    try {
      const response = await record({
        projectId,
        mode,
        source,
        mask: mask.length > 0 ? mask : undefined,
        includeFx,
        cueStackId: creating ? Number(stackId) : undefined,
        cueId: creating ? undefined : targetCueId,
        name: creating && name.trim() !== '' ? name.trim() : undefined,
        cueNumber: creating && cueNumber.trim() !== '' ? cueNumber.trim() : undefined,
        force,
      }).unwrap()
      setResult(response)
    } catch (err) {
      // A cue-edit session on the target cue is recoverable — its Discard would revert the
      // write, so the server refuses once and lets the operator insist.
      const body = (err as { data?: ProgrammerConflict })?.data
      if (body?.code === 'CUE_EDIT_SESSION_OPEN') setConflict(body)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !isLoading && onOpenChange(next)}>
      <SheetContent className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Record</SheetTitle>
          <SheetDescription>
            {targetCueName
              ? `Write the programmer into “${targetCueName}”.`
              : 'Write the programmer into a cue.'}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <div className="space-y-2">
            <Label>Mode</Label>
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(next) => next && setMode(next as RecordMode)}
              className="flex-wrap justify-start"
            >
              {MODES.filter((m) => m.value === 'CREATE' || targetCueId !== undefined).map((m) => (
                <ToggleGroupItem key={m.value} value={m.value} className="text-xs">
                  {m.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              {MODES.find((m) => m.value === mode)?.hint}
            </p>
          </div>

          {creating && (
            <>
              <div className="space-y-2">
                <Label htmlFor="record-stack">Stack</Label>
                <Select value={stackId} onValueChange={setStackId}>
                  <SelectTrigger id="record-stack">
                    <SelectValue placeholder="Choose a stack" />
                  </SelectTrigger>
                  <SelectContent>
                    {recordableStacks.map((stack) => (
                      <SelectItem key={stack.id} value={String(stack.id)}>
                        {stack.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="record-name">Name</Label>
                <Input
                  id="record-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Auto"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="record-number">Cue #</Label>
                <Input
                  id="record-number"
                  value={cueNumber}
                  onChange={(e) => setCueNumber(e.target.value)}
                  placeholder="Auto"
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>Source</Label>
            <Select value={source} onValueChange={(next) => setSource(next as RecordSource)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {SOURCES.find((s) => s.value === source)?.hint}
            </p>
          </div>

          <MaskPicker value={mask} onChange={setMask} />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeFx}
              onChange={(e) => setIncludeFx(e.target.checked)}
              className="size-4"
            />
            Record effects too
          </label>

          {conflict && (
            <Alert variant="destructive">
              <XCircle className="size-4" />
              <AlertDescription className="space-y-2">
                <p>{conflict.error}</p>
                <Button size="sm" variant="outline" onClick={() => submit(true)}>
                  Record anyway
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

          {result && <RecordResult result={result} />}
        </SheetBody>

        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          <Button onClick={() => submit(false)} disabled={!canSubmit || isLoading}>
            {isLoading && <Loader2 className="size-4 animate-spin" />}
            {isLoading ? 'Recording…' : 'Record'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/**
 * What actually landed. Reported rather than assumed: a silent Record reads as "everything
 * went in", which is exactly the impression the old lossy snapshot gave.
 */
function RecordResult({ result }: { result: RecordResponse }) {
  const preserved = result.preserved
  const notes: string[] = []
  if (result.groupRowsEmitted > 0) {
    notes.push(`${result.groupRowsEmitted} group row${result.groupRowsEmitted === 1 ? '' : 's'}`)
  }
  if (result.fxWritten > 0) notes.push(`${result.fxWritten} effect${result.fxWritten === 1 ? '' : 's'}`)
  if (preserved.triggers > 0) notes.push(`${preserved.triggers} trigger(s) kept`)
  if (preserved.timedPresetApplications + preserved.timedAdHocEffects > 0) {
    notes.push(
      `${preserved.timedPresetApplications + preserved.timedAdHocEffects} timed effect(s) kept`,
    )
  }
  if (preserved.outOfMaskAssignments > 0) {
    notes.push(`${preserved.outOfMaskAssignments} out-of-mask row(s) kept`)
  }
  if (result.republishedLive) notes.push('the live cue was republished')

  const skipNote = describeSkips(result.skipped)

  return (
    <Alert>
      <AlertDescription className="space-y-1">
        <p className="font-medium">
          {result.created ? 'Created' : 'Updated'} “{result.cue.name}” — {result.assignmentsWritten}{' '}
          value{result.assignmentsWritten === 1 ? '' : 's'} written
          {result.assignmentsRemoved > 0 ? `, ${result.assignmentsRemoved} removed` : ''}.
        </p>
        {notes.length > 0 && <p className="text-xs text-muted-foreground">{notes.join(' · ')}</p>}
        {skipNote && <p className="text-xs text-amber-600 dark:text-amber-500">{skipNote}</p>}
        {result.warnings.map((warning) => (
          <p key={warning} className="text-xs text-amber-600 dark:text-amber-500">
            {warning}
          </p>
        ))}
      </AlertDescription>
    </Alert>
  )
}

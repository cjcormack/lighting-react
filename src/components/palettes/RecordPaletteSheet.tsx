import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, TriangleAlert, XCircle } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatError } from '@/lib/formatError'
import { PALETTE_TYPES, PALETTE_TYPE_LABELS } from '@/lib/paletteTypes'
import { usePaletteListQuery, useRecordPaletteMutation } from '@/store/palettes'
import { describeSkips } from '@/components/programmer/maskPicker'
import type { PaletteType, RecordPaletteResponse } from '@/api/palettesApi'
import type { RecordMode, RecordSource } from '@/store/programmerOps'

export interface RecordPaletteSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  /** The type the page is showing. The operator can still change it when creating. */
  defaultType: PaletteType
  /** Preselect an existing palette — set when re-recording from its detail sheet. */
  targetPaletteId?: number
  /**
   * The operator's selection, groups expanded by the backend.
   *
   * Omitted means "whatever the programmer holds", which for a palette is almost never what was
   * meant — the sheet says so rather than quietly capturing the whole rig.
   */
  targets?: readonly { type: 'fixture' | 'group'; key: string }[]
}

const MODES: { value: RecordMode; label: string; hint: string }[] = [
  { value: 'CREATE', label: 'New palette', hint: 'Create a palette from these values.' },
  { value: 'MERGE', label: 'Merge', hint: 'Add to the palette, keeping the fixtures it already covers.' },
  {
    value: 'UPDATE_EXISTING',
    label: 'Replace',
    hint: 'Replace the palette’s contents entirely.',
  },
  { value: 'REMOVE', label: 'Remove', hint: 'Drop the rows these fixtures name from the palette.' },
]

const SOURCES: { value: RecordSource; label: string; hint: string }[] = [
  { value: 'TOUCHED', label: 'Programmer', hint: 'What you busked — the values you edited.' },
  {
    value: 'ALL',
    label: 'Programmer + hand-downs',
    hint: 'Also captures unpark hand-downs the programmer is holding.',
  },
  {
    value: 'STAGE_SNAPSHOT',
    label: 'Whole stage',
    hint: 'Everything on stage, including values from cues and running effects.',
  },
]

/**
 * Record the programmer into a palette.
 *
 * There is no attribute mask here, and that is deliberate: the palette's **type is** the mask
 * (server-side `PaletteType` literally is `PropertyMaskGroup`), so a COLOUR palette records
 * exactly the colour properties and there is no second control to get out of step with the first.
 *
 * Re-recording is also how a palette is *edited* — that, or Include → change → Update. There is no
 * per-cell palette editor, because a palette entry only means anything against a fixture, and the
 * programmer is already the place where you have fixtures in front of you.
 */
export function RecordPaletteSheet({
  open,
  onOpenChange,
  projectId,
  defaultType,
  targetPaletteId,
  targets,
}: RecordPaletteSheetProps) {
  const [record, { isLoading, error, reset }] = useRecordPaletteMutation()
  const [type, setType] = useState<PaletteType>(defaultType)
  // Skipped while closed: every SelectionToolbar mounts this sheet the moment a row is
  // selected, and an unskipped query would fetch the whole bank to render nothing.
  const { data: palettes } = usePaletteListQuery({ projectId, type }, { skip: !open })

  const [mode, setMode] = useState<RecordMode>(targetPaletteId ? 'MERGE' : 'CREATE')
  const [source, setSource] = useState<RecordSource>('TOUCHED')
  const [paletteId, setPaletteId] = useState<string>('')
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState<RecordPaletteResponse | null>(null)

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
    setType(defaultType)
    setMode(targetPaletteId ? 'MERGE' : 'CREATE')
    setSource('TOUCHED')
    setPaletteId(targetPaletteId ? String(targetPaletteId) : '')
    setName('')
    setNotes('')
    setResult(null)
    reset()
  }, [open, defaultType, targetPaletteId, reset])

  const creating = mode === 'CREATE'
  const canSubmit = creating ? name.trim() !== '' : paletteId !== ''

  const targetList = useMemo(
    () => (targets && targets.length > 0 ? targets.map((t) => ({ type: t.type, key: t.key })) : undefined),
    [targets],
  )

  const submit = async () => {
    try {
      const response = await record({
        projectId,
        mode,
        type,
        paletteId: creating ? undefined : Number(paletteId),
        name: creating ? name.trim() : undefined,
        notes: creating && notes.trim() !== '' ? notes.trim() : undefined,
        source,
        targets: targetList,
      }).unwrap()
      setResult(response)
    } catch {
      // Rendered inline from the mutation's own `error` — swallowed here so the rejection
      // doesn't surface as unhandled.
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !isLoading && onOpenChange(next)}>
      <SheetContent className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Record palette</SheetTitle>
          <SheetDescription>
            Capture the programmer as a named, reusable look. Cues that reference it move when you
            re-record it.
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
              {MODES.map((m) => (
                <ToggleGroupItem key={m.value} value={m.value} className="text-xs">
                  {m.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              {MODES.find((m) => m.value === mode)?.hint}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="record-palette-type">Type</Label>
            <Select
              value={type}
              onValueChange={(next) => {
                setType(next as PaletteType)
                // The palette list is per type, so a type change invalidates the chosen palette.
                setPaletteId('')
              }}
            >
              <SelectTrigger id="record-palette-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PALETTE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {PALETTE_TYPE_LABELS[t].singular}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The type is the mask: only {PALETTE_TYPE_LABELS[type].singular.toLowerCase()}{' '}
              properties are captured.
            </p>
          </div>

          {creating ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="record-palette-name">Name</Label>
                <Input
                  id="record-palette-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Warm Amber"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="record-palette-notes">Notes</Label>
                <Textarea
                  id="record-palette-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="record-palette-target">Palette</Label>
              <Select value={paletteId} onValueChange={setPaletteId}>
                <SelectTrigger id="record-palette-target">
                  <SelectValue placeholder="Choose a palette" />
                </SelectTrigger>
                <SelectContent>
                  {(palettes ?? []).map((palette) => (
                    <SelectItem key={palette.id} value={String(palette.id)}>
                      {palette.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

          {targetList ? (
            <p className="text-xs text-muted-foreground">
              Recording {targetList.length} selected target{targetList.length === 1 ? '' : 's'}.
            </p>
          ) : (
            <Alert>
              <TriangleAlert className="size-4" />
              <AlertDescription>
                No selection — this records every fixture the programmer currently holds. A named
                look usually means a specific set of heads, so select them first if that isn’t what
                you want.
              </AlertDescription>
            </Alert>
          )}

          {error != null && (
            <Alert variant="destructive">
              <XCircle className="size-4" />
              <AlertDescription>{formatError(error)}</AlertDescription>
            </Alert>
          )}

          {result && <RecordPaletteResult result={result} />}
        </SheetBody>

        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          <Button onClick={submit} disabled={!canSubmit || isLoading}>
            {isLoading && <Loader2 className="size-4 animate-spin" />}
            {isLoading ? 'Recording…' : 'Record'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/**
 * What actually landed.
 *
 * `cuesRepublished` is the line worth reading: re-recording a palette moves every live cue that
 * references it, which is the whole point of the feature and also the thing an operator would
 * rather not discover from the stage.
 */
function RecordPaletteResult({ result }: { result: RecordPaletteResponse }) {
  const notes: string[] = []
  if (result.groupRowsEmitted > 0) {
    notes.push(`${result.groupRowsEmitted} group row${result.groupRowsEmitted === 1 ? '' : 's'}`)
  }
  if (result.refsFlattened > 0) {
    notes.push(`${result.refsFlattened} reference(s) stored as their current value`)
  }
  if (result.programmerKeysRefreshed > 0) {
    notes.push(`${result.programmerKeysRefreshed} programmer value(s) re-resolved`)
  }
  if (result.cuesRepublished.length > 0) {
    notes.push(`${result.cuesRepublished.length} live cue(s) republished`)
  }
  const skipNote = describeSkips(result.skipped)

  return (
    <Alert>
      <AlertDescription className="space-y-1">
        <p className="font-medium">
          {result.created ? 'Created' : 'Updated'} “{result.palette.name}” —{' '}
          {result.entriesWritten} value{result.entriesWritten === 1 ? '' : 's'} written
          {result.entriesRemoved > 0 ? `, ${result.entriesRemoved} removed` : ''}.
        </p>
        {notes.length > 0 && <p className="text-xs text-muted-foreground">{notes.join(' · ')}</p>}
        {skipNote && <p className="text-xs text-amber-600 dark:text-amber-500">{skipNote}</p>}
      </AlertDescription>
    </Alert>
  )
}

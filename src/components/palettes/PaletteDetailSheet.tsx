import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Loader2, TriangleAlert, XCircle } from 'lucide-react'
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
import { formatError } from '@/lib/formatError'
import { PALETTE_TYPE_LABELS } from '@/lib/paletteTypes'
import { useDeletePaletteMutation, usePaletteQuery, useSavePaletteMutation } from '@/store/palettes'
import { useInclude } from '@/components/programmer/useInclude'
import { PaletteValueChip } from './paletteValue'
import type { PaletteInUseError, PaletteSummary } from '@/api/palettesApi'

export interface PaletteDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  /** The summary the grid already has, so the sheet has a name to show before the detail lands. */
  palette: PaletteSummary | null
  /** Open the Record sheet in re-record mode against this palette. */
  onRerecord: (palette: PaletteSummary) => void
}

/**
 * One palette's contents and metadata.
 *
 * Read-only about *values*, on purpose. Editing a palette is the record loop — Include it into
 * the programmer, change it on the rig you can see, Update it back — because a palette entry only
 * means anything against a real fixture, and a grid of hex codes divorced from the heads they
 * light is exactly the abstraction the programmer redesign exists to remove. Name, notes and
 * order are metadata and are editable here.
 */
export function PaletteDetailSheet({
  open,
  onOpenChange,
  projectId,
  palette,
  onRerecord,
}: PaletteDetailSheetProps) {
  const paletteId = palette?.id ?? 0
  const { data: detail, isFetching } = usePaletteQuery(
    { projectId, paletteId },
    { skip: !open || paletteId === 0 },
  )
  const [savePalette, { isLoading: isSaving, error: saveError }] = useSavePaletteMutation()
  const [deletePalette, { isLoading: isDeleting }] = useDeletePaletteMutation()
  const { include, isLoading: isIncluding } = useInclude(projectId)

  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [inUse, setInUse] = useState<PaletteInUseError | null>(null)

  // Seed the form once per palette, tracked by id in a ref rather than by dependencies.
  //
  // Depending on `name`/`notes` was wrong: the summary refetches on every WS palette
  // notification, so a re-record or a rename in another tab re-ran this and silently replaced
  // whatever the operator was halfway through typing — and `dirty` then read false, so nothing
  // showed that an edit had been lost. The operator's in-progress text wins; closing and
  // reopening re-seeds from the server.
  const seededPaletteIdRef = useRef<number | null>(null)
  useEffect(() => {
    if (palette == null) {
      seededPaletteIdRef.current = null
      return
    }
    if (seededPaletteIdRef.current === palette.id) return
    seededPaletteIdRef.current = palette.id
    setName(palette.name)
    setNotes(palette.notes ?? '')
    setInUse(null)
  }, [palette])

  const entriesByTarget = useMemo(() => {
    const byTarget = new Map<string, { targetKey: string; values: { property: string; value: string }[] }>()
    for (const entry of detail?.entries ?? []) {
      const bucket = byTarget.get(entry.targetKey) ?? { targetKey: entry.targetKey, values: [] }
      bucket.values.push({ property: entry.propertyName, value: entry.value })
      byTarget.set(entry.targetKey, bucket)
    }
    return [...byTarget.values()]
  }, [detail])

  if (!palette) return null

  const dirty = name.trim() !== palette.name || (notes.trim() || null) !== (palette.notes ?? null)

  const save = async () => {
    if (name.trim() === '') return
    await savePalette({
      projectId,
      paletteId: palette.id,
      name: name.trim(),
      notes: notes.trim() === '' ? null : notes.trim(),
    }).unwrap().catch(() => {
      // Rendered inline below.
    })
  }

  const remove = async (force: boolean) => {
    try {
      await deletePalette({ projectId, paletteId: palette.id, force }).unwrap()
      onOpenChange(false)
    } catch (err) {
      // 409: rows still reference it. Deleting anyway is allowed but leaves those rows dead
      // until they next fire, so the operator gets the count before they decide.
      const body = (err as { data?: PaletteInUseError })?.data
      if (body?.code === 'PALETTE_IN_USE') setInUse(body)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{palette.name}</SheetTitle>
          <SheetDescription>
            {PALETTE_TYPE_LABELS[palette.type].singular} palette · {palette.targetCount} fixture
            {palette.targetCount === 1 ? '' : 's'} · referenced by {palette.referenceCount} row
            {palette.referenceCount === 1 ? '' : 's'}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <div className="space-y-2">
            <Label htmlFor="palette-name">Name</Label>
            <Input id="palette-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="palette-notes">Notes</Label>
            <Textarea
              id="palette-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {saveError != null && (
            <Alert variant="destructive">
              <XCircle className="size-4" />
              <AlertDescription>{formatError(saveError)}</AlertDescription>
            </Alert>
          )}

          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            To change what this palette holds, <strong>Include</strong> it into the programmer,
            edit the fixtures on stage, then press <strong>Update</strong> — or re-record it from
            the programmer. Every cue that references it moves with it.
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isIncluding}
              onClick={() => include({ kind: 'PALETTE', paletteId: palette.id })}
            >
              {isIncluding ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              Include
            </Button>
            <Button variant="outline" size="sm" onClick={() => onRerecord(palette)}>
              Re-record
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Contents</Label>
            {isFetching && !detail ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : entriesByTarget.length === 0 ? (
              <p className="text-sm text-muted-foreground">No entries.</p>
            ) : (
              <div className="divide-y rounded-md border">
                {entriesByTarget.map((bucket) => (
                  <div key={bucket.targetKey} className="flex items-center gap-2 px-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm">{bucket.targetKey}</span>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {bucket.values.map((v) => (
                        <PaletteValueChip
                          key={`${bucket.targetKey}-${v.property}`}
                          type={palette.type}
                          value={v.value}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {inUse && (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" />
              <AlertDescription className="space-y-2">
                <p>
                  {inUse.error} Deleting it anyway leaves {inUse.referenceCount} row
                  {inUse.referenceCount === 1 ? '' : 's'} referencing a palette that no longer
                  exists — they will be skipped when their cue next fires. Make those rows hard
                  first if you want to keep their current look.
                </p>
                <Button size="sm" variant="destructive" onClick={() => remove(true)}>
                  Delete anyway
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </SheetBody>

        <SheetFooter className="flex-row justify-between">
          <Button variant="destructive" onClick={() => remove(false)} disabled={isDeleting}>
            {isDeleting && <Loader2 className="size-4 animate-spin" />}
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={save} disabled={!dirty || isSaving || name.trim() === ''}>
              {isSaving && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

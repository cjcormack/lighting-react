import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Sheet,
  SheetBody,
  SheetContent,
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
  CODE_SPEED_MASTER_IN_USE,
  type SpeedMaster,
  type SpeedMasterInUseResponse,
} from '../../api/speedMastersApi'
import { useDeleteSpeedMasterMutation, useSaveSpeedMasterMutation } from '../../store/speedMasters'

/**
 * Rename a master, note what it is for, and set the tempo it boots at.
 *
 * The *starting* BPM lives here, not the live one. They are different values with different
 * lifetimes: the row's `bpm` is what the master comes up at after a restart or an import,
 * while the live tempo is whatever it has been tapped to since. Editing them in the same
 * control would make one silently overwrite the other, so the live tempo stays on the row
 * (and the strip) where tap is, and this sheet owns the stored default.
 */
export function SpeedMasterDetailSheet({
  open,
  onOpenChange,
  projectId,
  master,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  master: SpeedMaster | null
}) {
  const [saveMaster, { isLoading: isSaving, error: saveError }] = useSaveSpeedMasterMutation()
  const [deleteMaster, { isLoading: isDeleting }] = useDeleteSpeedMasterMutation()

  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [startingBpm, setStartingBpm] = useState('')
  const [inUse, setInUse] = useState<SpeedMasterInUseResponse | null>(null)

  // Seed once per master, tracked by id in a ref rather than by dependencies — the list
  // refetches on every `speedMasters.listChanged`, and depending on the fields would let a
  // rename in another tab replace whatever is being typed here. Same rationale as
  // LookDetailSheet; closing and reopening re-seeds from the server.
  const seededIdRef = useRef<number | null>(null)
  useEffect(() => {
    if (master == null) {
      seededIdRef.current = null
      return
    }
    if (seededIdRef.current === master.id) return
    seededIdRef.current = master.id
    setName(master.name)
    setNotes(master.notes ?? '')
    setStartingBpm(String(master.bpm))
    setInUse(null)
  }, [master])

  if (!master) return null

  // Master 1 is the global tempo every legacy surface and every unassigned effect resolves
  // to. The server refuses to delete it (409 SPEED_MASTER_PROTECTED); saying so up front
  // beats round-tripping a request that cannot succeed.
  const isProtected = master.masterIndex === 1
  const parsedBpm = Number(startingBpm)
  const bpmValid = Number.isFinite(parsedBpm) && parsedBpm >= 20 && parsedBpm <= 300
  const dirty =
    name.trim() !== master.name ||
    (notes.trim() || null) !== (master.notes ?? null) ||
    (bpmValid && parsedBpm !== master.bpm)

  const save = async () => {
    if (name.trim() === '' || !bpmValid) return
    await saveMaster({
      projectId,
      masterId: master.id,
      name: name.trim(),
      // Only send the tempo when it was actually edited. The field is seeded once per
      // master and the PUT *retunes the running clock*, so resending the seed on a
      // name-only save would snap a master that has been tapped since back to its stored
      // value — silently undoing a live tempo change mid-show.
      ...(parsedBpm !== master.bpm ? { bpm: parsedBpm } : {}),
      notes: notes.trim() === '' ? null : notes.trim(),
    })
      .unwrap()
      .then(() => onOpenChange(false))
      .catch(() => {
        // Rendered inline below — a duplicate name is a 409 and nothing moved.
      })
  }

  const remove = async (force: boolean) => {
    try {
      await deleteMaster({ projectId, masterId: master.id, force }).unwrap()
      onOpenChange(false)
    } catch (err) {
      // 409: rows still reference it. Forcing is allowed — those effects fall back to
      // master 1 rather than stopping — but the operator gets the breakdown first.
      const body = (err as { data?: SpeedMasterInUseResponse })?.data
      if (body?.code === CODE_SPEED_MASTER_IN_USE) setInUse(body)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            M{master.masterIndex} · {master.name}
          </SheetTitle>
        </SheetHeader>

        <SheetBody>
          <div className="space-y-1.5">
            <Label htmlFor="speed-master-name">Name</Label>
            <Input
              id="speed-master-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Master ${master.masterIndex}`}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="speed-master-bpm">Starting BPM</Label>
            <Input
              id="speed-master-bpm"
              inputMode="decimal"
              value={startingBpm}
              onChange={(e) => setStartingBpm(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              What this master comes up at after a restart or an import. Tapping or typing a
              tempo on the row changes it live and writes back here shortly after.
            </p>
            {startingBpm !== '' && !bpmValid && (
              <p className="text-xs text-destructive">Must be between 20 and 300.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="speed-master-notes">Notes</Label>
            <Textarea
              id="speed-master-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What this master is for"
              rows={3}
            />
          </div>

          {master.referenceCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {master.referenceCount} saved{' '}
              {master.referenceCount === 1 ? 'reference' : 'references'} — look effects, cue
              effects and per-layer overrides that follow this master.
            </p>
          )}

          {saveError != null && (
            <Alert variant="destructive">
              <AlertDescription>
                {(saveError as { data?: { error?: string } })?.data?.error ??
                  'Could not save this master.'}
              </AlertDescription>
            </Alert>
          )}

          {inUse != null && (
            <Alert variant="destructive">
              <AlertDescription className="space-y-2">
                <p>
                  {inUse.referenceCount} saved{' '}
                  {inUse.referenceCount === 1 ? 'reference still points' : 'references still point'}{' '}
                  at this master
                  {inUse.lookEffectCount > 0 && ` · ${inUse.lookEffectCount} look effect(s)`}
                  {inUse.cueAdHocEffectCount > 0 && ` · ${inUse.cueAdHocEffectCount} cue effect(s)`}
                  {inUse.cueLayerCount > 0 && ` · ${inUse.cueLayerCount} cue layer(s)`}
                  {inUse.cueIds.length > 0 && ` (cues ${inUse.cueIds.join(', ')})`}.
                </p>
                <p>
                  Deleting anyway leaves them pointing at nothing, which resolves to master 1 —
                  those looks keep running, at the global tempo instead of this one.
                </p>
                <Button size="sm" variant="destructive" onClick={() => remove(true)}>
                  Delete anyway
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </SheetBody>

        <SheetFooter className="flex-row justify-between">
          <Button
            variant="destructive"
            onClick={() => remove(false)}
            disabled={isDeleting || isProtected}
            title={
              isProtected
                ? 'Master 1 is the global tempo — every unassigned effect resolves to it'
                : undefined
            }
          >
            {isDeleting && <Loader2 className="size-4 animate-spin" />}
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!dirty || isSaving || name.trim() === '' || !bpmValid}>
              {isSaving && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

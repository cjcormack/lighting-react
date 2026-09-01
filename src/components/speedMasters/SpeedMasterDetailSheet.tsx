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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  CODE_SPEED_MASTER_IN_USE,
  type SpeedMaster,
  type SpeedMasterInUseResponse,
} from '../../api/speedMastersApi'
import {
  useDeleteSpeedMasterMutation,
  useSaveSpeedMasterMutation,
  useSpeedMasterLiveQuery,
} from '../../store/speedMasters'
import {
  DEFAULT_FOLLOW_RATIO,
  FOLLOW_RATIOS,
  SPEED_MASTER_USAGES,
  derivedBpm,
  followRatioOf,
  formatFollowRatio,
  usageOptionLabel,
  type FollowRatio,
} from '@/lib/speedMasterModel'
import { formatBpm } from '../../hooks/useBpmDraft'

/**
 * Radix `Select` reserves the empty string for "no value", so "routes nothing" needs a sentinel
 * of its own rather than `''`. It never reaches the wire — {@link usageToSend} maps it back to
 * the null the PUT wants.
 */
const USAGE_NONE = '__none__'

/**
 * Rename a master, note what it is for, and set the tempo it boots at.
 *
 * The *starting* BPM lives here, not the live one. They are different values with different
 * lifetimes: the row's `bpm` is what the master comes up at after a restart or an import,
 * while the live tempo is whatever it has been tapped to since. Editing them in the same
 * control would make one silently overwrite the other, so the live tempo stays on the row
 * (and the strip) where tap is, and this sheet owns the stored default.
 *
 * It is also the only place the two routing facts are set — a master's **usage** (which
 * category of busked effect defaults to it) and whether it **follows master 1** at a ratio.
 * Both are deliberately here rather than on the performance surfaces: they are decisions about
 * how the show is wired, not knobs to reach for mid-cue, and the follow switch in particular
 * takes a master's own tempo away from it.
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
  const [usage, setUsage] = useState<string>(USAGE_NONE)
  // null = manual. Held as the ratio itself rather than a mode flag plus a ratio, so there is
  // exactly one source of truth for "is this following" and the two cannot disagree.
  const [follow, setFollow] = useState<FollowRatio | null>(null)
  const [inUse, setInUse] = useState<SpeedMasterInUseResponse | null>(null)

  // Master 1's *live* tempo, for the follow preview — the preview answers "what will this master
  // run at", which is a question about the running bank, not about stored defaults.
  const { master1Bpm } = useSpeedMasterLiveQuery(undefined, {
    selectFromResult: ({ data }) => ({ master1Bpm: data?.find((m) => m.index === 1)?.bpm ?? null }),
  })

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
    setUsage(master.usage ?? USAGE_NONE)
    setFollow(followRatioOf(master))
    setInUse(null)
  }, [master])

  if (!master) return null

  // Master 1 is the global tempo every legacy surface and every unassigned effect resolves
  // to. The server refuses to delete it (409 SPEED_MASTER_PROTECTED), and refuses to give it a
  // follow ratio (400 SPEED_MASTER_CANNOT_FOLLOW) — it is what followers derive *from*. Saying
  // both up front beats round-tripping a request that cannot succeed.
  const isProtected = master.masterIndex === 1
  const parsedBpm = Number(startingBpm)
  const bpmValid = Number.isFinite(parsedBpm) && parsedBpm >= 20 && parsedBpm <= 300
  const storedFollow = followRatioOf(master)
  const followChanged =
    follow?.num !== storedFollow?.num || follow?.den !== storedFollow?.den
  const usageToSend = usage === USAGE_NONE ? null : usage
  const usageChanged = usageToSend !== (master.usage ?? null)
  // A follower's tempo is derived, so its stored default is meaningless while linked and the
  // BPM field is not rendered at all — which also means it can never be dirty.
  const bpmChanged = follow == null && bpmValid && parsedBpm !== master.bpm
  const dirty =
    name.trim() !== master.name ||
    (notes.trim() || null) !== (master.notes ?? null) ||
    usageChanged ||
    followChanged ||
    bpmChanged
  // Only the manual arm can be invalid: the BPM field is the only one with a range.
  const canSave = name.trim() !== '' && (follow != null || bpmValid)

  const save = async () => {
    if (!canSave) return
    await saveMaster({
      projectId,
      masterId: master.id,
      name: name.trim(),
      // Only send the tempo when it was actually edited. The field is seeded once per
      // master and the PUT *retunes the running clock*, so resending the seed on a
      // name-only save would snap a master that has been tapped since back to its stored
      // value — silently undoing a live tempo change mid-show. And never send it at all
      // alongside a follow ratio: the server 400s the pair (SPEED_MASTER_FOLLOWER), because
      // a follower's tempo comes from master 1 rather than from a stored default.
      ...(bpmChanged ? { bpm: parsedBpm } : {}),
      // The PUT is a patch, so an untouched key is left alone; usage present-with-null clears.
      ...(usageChanged ? { usage: usageToSend } : {}),
      // Both halves or neither — a half-patch is a 400. Unlinking is both explicitly null.
      ...(followChanged ? { followNum: follow?.num ?? null, followDen: follow?.den ?? null } : {}),
      notes: notes.trim() === '' ? null : notes.trim(),
    })
      .unwrap()
      .then(() => onOpenChange(false))
      .catch(() => {
        // Rendered inline below — a duplicate name, or a usage another master already claims,
        // is a 409 and nothing moved.
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
            <Label htmlFor="speed-master-usage">Default usage</Label>
            <Select value={usage} onValueChange={setUsage}>
              <SelectTrigger id="speed-master-usage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={USAGE_NONE}>Not routed</SelectItem>
                {SPEED_MASTER_USAGES.map((u) => (
                  <SelectItem key={u} value={u}>
                    {usageOptionLabel(u)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              A busked effect with no explicit speed master follows the master whose usage
              matches its family. One master per usage — unmatched effects stay on Master 1.
            </p>
          </div>

          <div className="border-t" />

          {/* Master 1 is what followers derive from, so it is offered no tempo mode at all —
              only the stored default below. Hiding the control rather than disabling it: a
              segmented switch with both halves dead reads as breakage. */}
          {!isProtected && (
            <div className="space-y-1.5">
              <Label>Tempo</Label>
              <ToggleGroup
                type="single"
                value={follow == null ? 'manual' : 'follow'}
                onValueChange={(v) => {
                  if (!v) return
                  setFollow(v === 'follow' ? (storedFollow ?? DEFAULT_FOLLOW_RATIO) : null)
                }}
                className="w-full gap-1"
              >
                <ToggleGroupItem value="manual" className="flex-1">
                  Manual
                </ToggleGroupItem>
                <ToggleGroupItem value="follow" className="flex-1">
                  Follow Master 1
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}

          {follow != null ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Time signature</Label>
                <ToggleGroup
                  type="single"
                  value={`${follow.num}/${follow.den}`}
                  onValueChange={(v) => {
                    if (!v) return
                    const [num, den] = v.split('/').map(Number)
                    setFollow({ num, den })
                  }}
                  className="w-full gap-1"
                >
                  {FOLLOW_RATIOS.map((r) => (
                    <ToggleGroupItem
                      key={r.label}
                      value={`${r.num}/${r.den}`}
                      className="flex-1 font-bold"
                      aria-label={`Follow Master 1 at ${r.num}/${r.den}`}
                    >
                      {r.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              {/* What the ratio actually resolves to, off master 1's *live* tempo — the
                  arithmetic is the server's, this only shows its answer. */}
              {master1Bpm != null && (
                <div className="flex items-center gap-3 rounded-md bg-muted/40 p-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      Master 1
                    </span>
                    <span className="font-mono text-lg font-bold tabular-nums">
                      {formatBpm(master1Bpm)}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    → {formatFollowRatio(follow.num, follow.den)} →
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      This master
                    </span>
                    <span className="font-mono text-lg font-bold tabular-nums text-primary">
                      {formatBpm(derivedBpm(master1Bpm, follow.num, follow.den))}
                    </span>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                While following, TAP and typed tempos are disabled on this master — retune
                Master 1 and this master moves with it, everywhere it is shown.
              </p>
            </div>
          ) : (
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
          )}

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
            <Button onClick={save} disabled={!dirty || isSaving || !canSave}>
              {isSaving && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetBody,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Trash2, X } from 'lucide-react'
import { useUpdatePatchMutation, useDeletePatchMutation, usePatchGroupListQuery } from '@/store/patches'
import { useFixtureTypeListQuery } from '@/store/fixtures'
import { GroupComboInput } from './GroupComboInput'
import { PatchPlacementFields, type PatchPlacementValue } from './PatchPlacementFields'
import { BeamAngleField } from './BeamAngleField'
import { GelPickerField } from './GelPickerField'
import type { FixturePatch } from '@/api/patchApi'

interface EditPatchSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patch: FixturePatch | null
  projectId: number
  existingPatches: FixturePatch[]
}

export function EditPatchSheet({ open, onOpenChange, patch, projectId, existingPatches }: EditPatchSheetProps) {
  const [displayName, setDisplayName] = useState('')
  const [key, setKey] = useState('')
  const [startChannel, setStartChannel] = useState(1)
  const [addGroupValue, setAddGroupValue] = useState('')

  const [placement, setPlacement] = useState<PatchPlacementValue>({
    riggingUuid: null,
    stageX: null,
    stageY: null,
    stageZ: null,
    baseYawDeg: null,
    basePitchDeg: null,
  })
  const [beamAngleDeg, setBeamAngleDeg] = useState<number | null>(null)
  const [gelCode, setGelCode] = useState<string | null>(null)

  const [updatePatch, { isLoading: isUpdating }] = useUpdatePatchMutation()
  const [deletePatch, { isLoading: isDeleting }] = useDeletePatchMutation()
  const { data: patchGroups } = usePatchGroupListQuery(projectId)
  const { data: fixtureTypes } = useFixtureTypeListQuery()

  useEffect(() => {
    if (patch) {
      setDisplayName(patch.displayName)
      setKey(patch.key)
      setStartChannel(patch.startChannel)
      setPlacement({
        riggingUuid: patch.riggingUuid,
        stageX: patch.stageX,
        stageY: patch.stageY,
        stageZ: patch.stageZ,
        baseYawDeg: patch.baseYawDeg,
        basePitchDeg: patch.basePitchDeg,
      })
      setBeamAngleDeg(patch.beamAngleDeg)
      setGelCode(patch.gelCode)
      setAddGroupValue('')
    }
  }, [patch])

  if (!patch) return null

  const channelCount = patch.channelCount ?? 1
  const lastChannel = startChannel + channelCount - 1
  const channelOverflow = lastChannel > 512

  const keyConflict = existingPatches.some(p => p.key === key && p.id !== patch.id)

  const fixtureType = fixtureTypes?.find((t) => t.typeKey === patch.fixtureTypeKey)
  const acceptsBeamAngle = fixtureType?.acceptsBeamAngle ?? false
  const acceptsGel = fixtureType?.acceptsGel ?? false
  const beamGelTitle =
    acceptsBeamAngle && acceptsGel ? 'Beam & Gel' : acceptsBeamAngle ? 'Beam' : 'Gel'

  const isValid = displayName.trim().length > 0 && key.trim().length > 0 && !channelOverflow && !keyConflict && startChannel >= 1
  const hasChanges =
    displayName !== patch.displayName ||
    key !== patch.key ||
    startChannel !== patch.startChannel ||
    placement.riggingUuid !== patch.riggingUuid ||
    placement.stageX !== patch.stageX ||
    placement.stageY !== patch.stageY ||
    placement.stageZ !== patch.stageZ ||
    placement.baseYawDeg !== patch.baseYawDeg ||
    placement.basePitchDeg !== patch.basePitchDeg ||
    beamAngleDeg !== patch.beamAngleDeg ||
    gelCode !== patch.gelCode

  const handleSave = async () => {
    const body: Record<string, unknown> = {}
    if (displayName !== patch.displayName) body.displayName = displayName
    if (key !== patch.key) body.key = key
    if (startChannel !== patch.startChannel) body.startChannel = startChannel
    if (placement.riggingUuid !== patch.riggingUuid) body.riggingUuid = placement.riggingUuid
    if (placement.stageX !== patch.stageX) body.stageX = placement.stageX
    if (placement.stageY !== patch.stageY) body.stageY = placement.stageY
    if (placement.stageZ !== patch.stageZ) body.stageZ = placement.stageZ
    if (placement.baseYawDeg !== patch.baseYawDeg) body.baseYawDeg = placement.baseYawDeg
    if (placement.basePitchDeg !== patch.basePitchDeg) body.basePitchDeg = placement.basePitchDeg
    if (beamAngleDeg !== patch.beamAngleDeg) body.beamAngleDeg = beamAngleDeg
    if (gelCode !== patch.gelCode) body.gelCode = gelCode
    await updatePatch({ projectId, patchId: patch.id, ...body }).unwrap()
    onOpenChange(false)
  }

  const handleAddToGroup = async (name: string) => {
    if (!name) return
    await updatePatch({ projectId, patchId: patch.id, addToGroup: name }).unwrap()
  }

  const handleRemoveFromGroup = async (groupId: number) => {
    await updatePatch({ projectId, patchId: patch.id, removeFromGroupId: groupId }).unwrap()
  }

  const handleDelete = async () => {
    await deletePatch({ projectId, patchId: patch.id }).unwrap()
    onOpenChange(false)
  }

  const typeLabel = [patch.manufacturer, patch.model, patch.modeName ? `(${patch.modeName})` : null]
    .filter(Boolean).join(' ')

  const currentGroupNames = new Set(patch.groups.map(g => g.name))
  const availableGroups = (patchGroups ?? []).filter(g => !currentGroupNames.has(g.name))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit Fixture</SheetTitle>
          {typeLabel && <p className="text-xs text-muted-foreground">{typeLabel} &middot; {channelCount}ch</p>}
        </SheetHeader>

        <SheetBody>
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Display Name</Label>
            <Input
              id="edit-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-key">Key</Label>
            <Input
              id="edit-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            {keyConflict && (
              <p className="text-xs text-destructive">Key already exists</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-start">Start Channel</Label>
            <Input
              id="edit-start"
              type="number"
              min={1}
              max={512}
              value={startChannel}
              onChange={(e) => setStartChannel(Math.max(1, Number(e.target.value) || 1))}
              onFocus={(e) => e.target.select()}
            />
            <p className="text-xs text-muted-foreground">
              Channels {startChannel}-{Math.min(lastChannel, 512)} on universe {patch.universe}
            </p>
            {channelOverflow && (
              <p className="text-xs text-destructive">
                Extends to channel {lastChannel} — max start: {512 - channelCount + 1}
              </p>
            )}
          </div>

          <PatchPlacementFields
            projectId={projectId}
            value={placement}
            onChange={setPlacement}
          />

          {(acceptsBeamAngle || acceptsGel) && (
            <div className="space-y-2.5 rounded-md border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">{beamGelTitle}</p>
              {acceptsBeamAngle && (
                <BeamAngleField
                  id="edit-beam"
                  value={beamAngleDeg}
                  onChange={setBeamAngleDeg}
                />
              )}
              {acceptsGel && (
                <GelPickerField
                  id="edit-gel"
                  value={gelCode}
                  onChange={setGelCode}
                />
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Groups</Label>
            {patch.groups.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {patch.groups.map((g) => (
                  <Badge key={g.id} variant="secondary" className="text-xs pl-2 pr-1 py-0.5 gap-1">
                    {g.name}
                    <button
                      type="button"
                      onClick={() => handleRemoveFromGroup(g.id)}
                      className="text-muted-foreground hover:text-foreground ml-0.5"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <GroupComboInput
              value={addGroupValue}
              onChange={(name) => {
                if (name) handleAddToGroup(name)
              }}
              groups={availableGroups}
              placeholder="Add to group..."
              clearOnSelect
            />
          </div>

        </SheetBody>

        <SheetFooter className="flex-row justify-between">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 className="size-3.5 mr-1.5" />
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUpdating}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!isValid || !hasChanges || isUpdating}>
              {isUpdating ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

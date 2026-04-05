import { useState, useMemo } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronLeft, AlertTriangle } from 'lucide-react'
import { useFixtureTypeListQuery } from '@/store/fixtures'
import { useCreatePatchesMutation, usePatchGroupListQuery } from '@/store/patches'
import { GroupComboInput } from './GroupComboInput'
import { FixtureTypePickerContent, type FixtureCountMap } from '@/components/presets/FixtureTypePicker'
import { buildFixtureTypeHierarchy, type FixtureTypeHierarchy } from '@/api/fxPresetsApi'
import type { FixturePatch } from '@/api/patchApi'

interface AddFixtureSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  existingPatches: FixturePatch[]
}

type Step = 'type' | 'configure'

export function AddFixtureSheet({
  open,
  onOpenChange,
  projectId,
  existingPatches,
}: AddFixtureSheetProps) {
  const [step, setStep] = useState<Step>('type')
  const [selectedTypeKey, setSelectedTypeKey] = useState<string | null>(null)
  const [count, setCount] = useState(1)
  const [universe, setUniverse] = useState(0)
  const [startChannel, setStartChannel] = useState(1)
  const [keyPrefix, setKeyPrefix] = useState('')
  const [namePrefix, setNamePrefix] = useState('')
  const [address, setAddress] = useState('')
  const [groupName, setGroupName] = useState('')

  const { data: fixtureTypes } = useFixtureTypeListQuery()
  const [createPatches, { isLoading }] = useCreatePatchesMutation()
  const { data: patchGroups } = usePatchGroupListQuery(projectId)

  const hierarchy = useMemo<FixtureTypeHierarchy | null>(() => {
    if (!fixtureTypes) return null
    return buildFixtureTypeHierarchy(fixtureTypes)
  }, [fixtureTypes])

  // Get counts from existing patches for the badge display
  const fixtureCounts = useMemo<FixtureCountMap>(() => {
    const map = new Map<string, number>()
    for (const p of existingPatches) {
      map.set(p.fixtureTypeKey, (map.get(p.fixtureTypeKey) ?? 0) + 1)
    }
    return map
  }, [existingPatches])

  const selectedType = fixtureTypes?.find(t => t.typeKey === selectedTypeKey)
  const channelCount = selectedType?.channelCount ?? 0

  // Check if the selected universe already exists
  const universeExists = existingPatches.some(p => p.universe === universe)

  // Validation
  const lastChannel = startChannel + (channelCount * count) - 1
  const channelOverflow = lastChannel > 512
  const maxStartChannel = channelCount > 0 ? 512 - (channelCount * count) + 1 : 512

  // Check overlaps
  const universePatch = existingPatches.filter(p => p.universe === universe)
  const overlapWarning = useMemo(() => {
    for (let i = 0; i < count; i++) {
      const start = startChannel + (channelCount * i)
      const end = start + channelCount - 1
      const overlap = universePatch.find(p => {
        const pEnd = p.startChannel + (p.channelCount ?? 1) - 1
        return start <= pEnd && end >= p.startChannel
      })
      if (overlap) return `Overlaps with "${overlap.displayName}" (channels ${overlap.startChannel}-${overlap.startChannel + (overlap.channelCount ?? 1) - 1})`
    }
    return null
  }, [startChannel, count, channelCount, universePatch])

  // Key conflict check
  const existingKeys = new Set(existingPatches.map(p => p.key))
  const generatedKeys = Array.from({ length: count }, (_, i) =>
    count === 1 ? keyPrefix : `${keyPrefix}-${i + 1}`
  )
  const keyConflict = generatedKeys.find(k => existingKeys.has(k))

  const isValid = selectedTypeKey && keyPrefix && namePrefix && !channelOverflow && !overlapWarning && !keyConflict && startChannel >= 1

  const handleTypeSelect = (typeKey: string | null) => {
    if (!typeKey) return
    setSelectedTypeKey(typeKey)

    // Auto-fill prefix from model name
    const type = fixtureTypes?.find(t => t.typeKey === typeKey)
    if (type?.model) {
      const prefix = type.model.toLowerCase().replace(/\s+/g, '-')
      setKeyPrefix(prefix)
      setNamePrefix(type.model)
    }

    // Auto-suggest start channel (first gap in universe)
    const typeChannelCount = type?.channelCount ?? 1
    const patchesInUniverse = existingPatches
      .filter(p => p.universe === universe)
      .sort((a, b) => a.startChannel - b.startChannel)

    let suggested = 1
    for (const p of patchesInUniverse) {
      const pEnd = p.startChannel + (p.channelCount ?? 1)
      if (suggested < p.startChannel && suggested + typeChannelCount - 1 < p.startChannel) break
      suggested = pEnd
    }
    setStartChannel(suggested)

    setStep('configure')
  }

  const handleCreate = async () => {
    if (!selectedTypeKey) return
    await createPatches({
      projectId,
      universe,
      fixtureTypeKey: selectedTypeKey,
      count,
      startChannel,
      keyPrefix,
      namePrefix,
      address: !universeExists && address ? address : undefined,
      groupName: groupName || undefined,
    }).unwrap()
    handleClose()
  }

  const handleClose = () => {
    setStep('type')
    setSelectedTypeKey(null)
    setCount(1)
    setStartChannel(1)
    setKeyPrefix('')
    setNamePrefix('')
    setAddress('')
    setGroupName('')
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-md">
        {step === 'type' && (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>Add Fixture</SheetTitle>
            </SheetHeader>
            <FixtureTypePickerContent
              hierarchy={hierarchy}
              fixtureCounts={fixtureCounts}
              onSelect={handleTypeSelect}
              onClose={handleClose}
              options={{
                title: 'Add Fixture',
                subtitle: 'Choose a fixture type to patch.',
                showClearOption: false,
                dimUnregistered: false,
                closeOnSelect: false,
              }}
            />
          </>
        )}

        {step === 'configure' && selectedType && (
          <>
            <div className="flex items-center gap-2 px-4 pt-4 pb-3">
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={() => setStep('type')}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <div>
                <SheetTitle className="text-base">
                  {selectedType.manufacturer} {selectedType.model}
                </SheetTitle>
                <p className="text-xs text-muted-foreground">
                  {selectedType.channelCount} channels
                  {selectedType.modeName && ` (${selectedType.modeName})`}
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="patch-count">Count</Label>
                  <Input
                    id="patch-count"
                    type="number"
                    min={1}
                    max={50}
                    value={count}
                    onChange={e => setCount(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="patch-universe">Universe</Label>
                  <Input
                    id="patch-universe"
                    type="number"
                    min={0}
                    value={universe}
                    onChange={e => setUniverse(Number(e.target.value) || 0)}
                  />
                </div>
              </div>

              {!universeExists && (
                <div className="space-y-1.5">
                  <Label htmlFor="patch-address">ArtNet Address (optional)</Label>
                  <Input
                    id="patch-address"
                    placeholder="e.g. 192.168.1.100"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">New universe will be created</p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="patch-start">Start Channel</Label>
                <Input
                  id="patch-start"
                  type="number"
                  min={1}
                  max={512}
                  value={startChannel}
                  onChange={e => setStartChannel(Math.max(1, Number(e.target.value) || 1))}
                />
                {channelCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Uses channels {startChannel}-{Math.min(lastChannel, 512)}
                    {count > 1 && ` (${count} fixtures)`}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="patch-key">Key Prefix</Label>
                <Input
                  id="patch-key"
                  value={keyPrefix}
                  onChange={e => setKeyPrefix(e.target.value)}
                  placeholder="e.g. par"
                />
                {count > 1 && keyPrefix && (
                  <p className="text-xs text-muted-foreground">
                    Keys: {generatedKeys.slice(0, 3).join(', ')}
                    {count > 3 && `, ... (${count} total)`}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="patch-name">Name Prefix</Label>
                <Input
                  id="patch-name"
                  value={namePrefix}
                  onChange={e => setNamePrefix(e.target.value)}
                  placeholder="e.g. PAR"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="patch-group">Group</Label>
                <GroupComboInput
                  value={groupName}
                  onChange={setGroupName}
                  groups={patchGroups ?? []}
                  placeholder="Type to assign or create..."
                />
              </div>

              {/* Warnings */}
              {channelOverflow && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <span>Extends to channel {lastChannel}. Max start channel: {maxStartChannel}</span>
                </div>
              )}
              {overlapWarning && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <span>{overlapWarning}</span>
                </div>
              )}
              {keyConflict && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <span>Key "{keyConflict}" already exists</span>
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t">
              <Button
                className="w-full"
                disabled={!isValid || isLoading}
                onClick={handleCreate}
              >
                {isLoading ? "Creating..." : count === 1 ? "Add Fixture" : `Add ${count} Fixtures`}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

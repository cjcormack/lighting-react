import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Bookmark } from 'lucide-react'
import { useProjectPresetListQuery } from '@/store/fxPresets'
import { useGroupListQuery } from '@/store/groups'
import { useFixtureListQuery } from '@/store/fixtures'
import { CueTargetPicker } from './CueTargetPicker'
import { EFFECT_CATEGORY_INFO } from '@/components/fx/fxConstants'
import type { CueTarget } from '@/api/cuesApi'

interface CuePresetPickerProps {
  projectId: number
  onConfirm: (app: { presetId: number; presetName: string; targets: CueTarget[] }) => void
  onCancel: () => void
  /** For edit mode: pre-selected targets */
  existingTargets?: CueTarget[]
  /** For edit mode: pre-selected preset (skip target step) */
  existingPresetId?: number
}

type Step = 'targets' | 'preset'

export function CuePresetPicker({
  projectId,
  onConfirm,
  onCancel,
  existingTargets,
  existingPresetId,
}: CuePresetPickerProps) {
  const { data: presets } = useProjectPresetListQuery(projectId)
  const { data: groups } = useGroupListQuery()
  const { data: fixtures } = useFixtureListQuery()

  // If editing (existingPresetId set), start at preset step with existing targets
  const [step, setStep] = useState<Step>(existingPresetId != null ? 'preset' : 'targets')
  const [selectedTargets, setSelectedTargets] = useState<CueTarget[]>(existingTargets ?? [])

  // Set of all preset IDs available in this project
  const allPresetIds = useMemo(() => {
    if (!presets) return new Set<number>()
    return new Set(presets.map((p) => p.id))
  }, [presets])

  // Compute disabled keys: targets whose compatiblePresetIds have NO overlap with available presets
  const disabledKeys = useMemo(() => {
    const disabled = new Map<string, string>()
    if (!presets || presets.length === 0) return disabled

    if (groups) {
      for (const group of groups) {
        const hasCompatible = group.compatiblePresetIds.some((id) => allPresetIds.has(id))
        if (!hasCompatible) {
          disabled.set(`group:${group.name}`, 'no presets')
        }
      }
    }
    if (fixtures) {
      for (const fixture of fixtures) {
        const hasCompatible = fixture.compatiblePresetIds.some((id) => allPresetIds.has(id))
        if (!hasCompatible) {
          disabled.set(`fixture:${fixture.key}`, 'no presets')
        }
      }
    }
    return disabled
  }, [groups, fixtures, presets, allPresetIds])

  // Compute compatible preset IDs from selected targets
  const compatiblePresetIds = useMemo(() => {
    if (selectedTargets.length === 0) return null

    const sets: Set<number>[] = []
    for (const target of selectedTargets) {
      if (target.type === 'group') {
        const group = groups?.find((g) => g.name === target.key)
        if (group) sets.push(new Set(group.compatiblePresetIds))
      } else {
        const fixture = fixtures?.find((f) => f.key === target.key)
        if (fixture) sets.push(new Set(fixture.compatiblePresetIds))
      }
    }

    if (sets.length === 0) return null

    // Union of all compatible preset IDs (show any preset that works for at least one target)
    const union = new Set<number>()
    for (const s of sets) {
      for (const id of s) union.add(id)
    }
    return union
  }, [selectedTargets, groups, fixtures])

  // Filter to only compatible presets (or show all if no targets selected yet)
  const filteredPresets = useMemo(() => {
    if (!presets) return []
    if (!compatiblePresetIds) return presets
    return presets.filter((p) => compatiblePresetIds.has(p.id))
  }, [presets, compatiblePresetIds])

  const handleSelectPreset = (preset: { id: number; name: string }) => {
    onConfirm({
      presetId: preset.id,
      presetName: preset.name,
      targets: selectedTargets,
    })
  }

  return (
    <div className="flex flex-col h-full">
      {step === 'targets' && (
        <>
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <button onClick={onCancel} className="hover:bg-accent rounded p-0.5 -ml-1">
              <ChevronLeft className="size-5" />
            </button>
            <div>
              <h3 className="font-medium text-sm">Select Targets</h3>
              <p className="text-xs text-muted-foreground">
                Choose which fixtures or groups to apply a preset to.
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <CueTargetPicker
              selectedTargets={selectedTargets}
              onChange={setSelectedTargets}
              disabledKeys={disabledKeys}
            />
          </div>

          <div className="border-t px-4 pb-4 pt-2">
            <Button
              onClick={() => setStep('preset')}
              disabled={selectedTargets.length === 0}
              className="w-full"
            >
              Next — Choose Preset
              {selectedTargets.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  {selectedTargets.length} target{selectedTargets.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </Button>
          </div>
        </>
      )}

      {step === 'preset' && (
        <>
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <button
              onClick={() => {
                if (existingPresetId != null) {
                  onCancel()
                } else {
                  setStep('targets')
                }
              }}
              className="hover:bg-accent rounded p-0.5 -ml-1"
            >
              <ChevronLeft className="size-5" />
            </button>
            <div>
              <h3 className="font-medium text-sm">Choose Preset</h3>
              <p className="text-xs text-muted-foreground">
                {selectedTargets.length} target{selectedTargets.length !== 1 ? 's' : ''} selected.
                Pick a preset to apply.
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-1 p-4 pt-0">
              {filteredPresets.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {compatiblePresetIds
                    ? 'No compatible presets for the selected targets.'
                    : 'No presets available in this project.'}
                </div>
              )}
              {filteredPresets.map((preset) => {
                // Unique categories in the preset
                const categories = [...new Set(preset.effects.map((e) => e.category))]

                return (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset)}
                    className="flex items-center gap-2 p-3 rounded-md border text-left hover:bg-accent/50 transition-colors"
                  >
                    <Bookmark className="size-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{preset.name}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {categories.map((cat) => {
                          const info = EFFECT_CATEGORY_INFO[cat]
                          const CatIcon = info?.icon
                          return CatIcon ? (
                            <span key={cat} title={info.label}>
                              <CatIcon className="size-3 text-muted-foreground" />
                            </span>
                          ) : null
                        })}
                        <span className="text-[10px] text-muted-foreground">
                          {preset.effects.length} effect{preset.effects.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

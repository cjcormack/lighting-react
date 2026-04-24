import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Bookmark } from 'lucide-react'
import { useProjectPresetListQuery } from '@/store/fxPresets'
import { useGroupListQuery } from '@/store/groups'
import { useFixtureListQuery } from '@/store/fixtures'
import { CueTargetPicker } from '../CueTargetPicker'
import { TimingFields } from '../TimingEditor'
import { EFFECT_CATEGORY_INFO } from '@/components/fx/fxConstants'
import type { CueTarget } from '@/api/cuesApi'

interface TimingValues {
  delayMs?: number | null
  intervalMs?: number | null
  randomWindowMs?: number | null
}

interface PresetPickerProps {
  projectId: number
  onConfirm: (app: {
    presetId: number
    presetName: string
    targets: CueTarget[]
    delayMs?: number | null
    intervalMs?: number | null
    randomWindowMs?: number | null
  }) => void
  onCancel: () => void
  /** For edit mode: pre-selected targets */
  existingTargets?: CueTarget[]
  /** For edit mode: pre-selected preset (skip target step) */
  existingPresetId?: number
  /** For edit mode: pre-populate timing values */
  existingTiming?: TimingValues
  /** Add mode: pre-selected target — skips the target-picker step. */
  preselectedTarget?: CueTarget | null
}

type Step = 'targets' | 'preset' | 'timing'

export function PresetPicker({
  projectId,
  onConfirm,
  onCancel,
  existingTargets,
  existingPresetId,
  existingTiming,
  preselectedTarget,
}: PresetPickerProps) {
  const { data: presets } = useProjectPresetListQuery(projectId)
  const { data: groups } = useGroupListQuery()
  const { data: fixtures } = useFixtureListQuery()

  const isEdit = existingPresetId != null
  const hasPreselectedTarget = !isEdit && !!preselectedTarget

  // Initial step: edit → timing, preselected target → preset, otherwise targets.
  const [step, setStep] = useState<Step>(
    isEdit ? 'timing' : hasPreselectedTarget ? 'preset' : 'targets',
  )
  const [selectedTarget, setSelectedTarget] = useState<CueTarget | null>(
    existingTargets?.[0] ?? preselectedTarget ?? null,
  )
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(existingPresetId ?? null)
  const [selectedPresetName, setSelectedPresetName] = useState<string | null>(null)
  const [timingValues, setTimingValues] = useState<TimingValues>({
    delayMs: existingTiming?.delayMs ?? null,
    intervalMs: existingTiming?.intervalMs ?? null,
    randomWindowMs: existingTiming?.randomWindowMs ?? null,
  })

  // Resolve preset name for edit mode
  const resolvedPresetName = selectedPresetName ?? presets?.find((p) => p.id === selectedPresetId)?.name ?? 'Preset'

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

  // Compute compatible preset IDs from the selected target
  const compatiblePresetIds = useMemo(() => {
    if (!selectedTarget) return null

    if (selectedTarget.type === 'group') {
      const group = groups?.find((g) => g.name === selectedTarget.key)
      if (group) return new Set(group.compatiblePresetIds)
    } else {
      const fixture = fixtures?.find((f) => f.key === selectedTarget.key)
      if (fixture) return new Set(fixture.compatiblePresetIds)
    }

    return null
  }, [selectedTarget, groups, fixtures])

  // Filter to only compatible presets (or show all if no targets selected yet)
  const filteredPresets = useMemo(() => {
    if (!presets) return []
    if (!compatiblePresetIds) return presets
    return presets.filter((p) => compatiblePresetIds.has(p.id))
  }, [presets, compatiblePresetIds])

  const handleTargetSelect = (target: CueTarget) => {
    setSelectedTarget(target)
    setStep('preset')
  }

  const handleSelectPreset = (preset: { id: number; name: string }) => {
    setSelectedPresetId(preset.id)
    setSelectedPresetName(preset.name)
    setStep('timing')
  }

  const handleConfirm = () => {
    if (!selectedTarget || selectedPresetId == null) return
    onConfirm({
      presetId: selectedPresetId,
      presetName: resolvedPresetName,
      targets: [selectedTarget],
      delayMs: timingValues.delayMs,
      intervalMs: timingValues.intervalMs,
      randomWindowMs: timingValues.randomWindowMs,
    })
  }

  const handleBackFromTiming = () => {
    if (existingPresetId != null) {
      onCancel()
    } else {
      setStep('preset')
    }
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
              <h3 className="font-medium text-sm">Select Target</h3>
              <p className="text-xs text-muted-foreground">
                Choose a fixture or group to apply a preset to.
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <CueTargetPicker
              onSelect={handleTargetSelect}
              disabledKeys={disabledKeys}
            />
          </div>
        </>
      )}

      {step === 'preset' && (
        <>
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <button
              onClick={() => {
                if (hasPreselectedTarget) {
                  onCancel()
                } else {
                  setSelectedTarget(null)
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
                {selectedTarget?.key ?? 'Target'} — pick a preset to apply.
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

      {step === 'timing' && (
        <>
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <button onClick={handleBackFromTiming} className="hover:bg-accent rounded p-0.5 -ml-1">
              <ChevronLeft className="size-5" />
            </button>
            <div>
              <h3 className="font-medium text-sm">{resolvedPresetName}</h3>
              <p className="text-xs text-muted-foreground">
                Configure when this preset should be applied.
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <TimingFields values={timingValues} onChange={setTimingValues} />
          </div>

          <div className="border-t p-4 flex items-center gap-2">
            <div className="flex-1" />
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
            <Button onClick={handleConfirm}>
              {existingPresetId != null ? 'Save' : 'Add Preset'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

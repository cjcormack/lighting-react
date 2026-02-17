import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { EffectParameterForm } from '@/components/fixtures/fx/EffectParameterForm'
import type { EffectLibraryEntry } from '@/store/fixtureFx'

interface ConfigureEffectSheetProps {
  effect: EffectLibraryEntry | null
  defaultBeatDivision: number
  onApply: (params: {
    beatDivision: number
    blendMode: string
    phaseOffset: number
    distribution: string
    parameters: Record<string, string>
  }) => void
  onClose: () => void
  /** Whether the targets include a group (for showing distribution) */
  hasGroupTarget: boolean
}

export function ConfigureEffectSheet({
  effect,
  defaultBeatDivision,
  onApply,
  onClose,
  hasGroupTarget,
}: ConfigureEffectSheetProps) {
  const isOpen = effect !== null

  const [beatDivision, setBeatDivision] = useState(defaultBeatDivision)
  const [blendMode, setBlendMode] = useState('OVERRIDE')
  const [phaseOffset, setPhaseOffset] = useState(0)
  const [distribution, setDistribution] = useState('LINEAR')
  const [parameters, setParameters] = useState<Record<string, string>>({})

  // Reset state when a new effect is opened
  useEffect(() => {
    if (!effect) return
    setBeatDivision(defaultBeatDivision)
    setBlendMode('OVERRIDE')
    setPhaseOffset(0)
    setDistribution('LINEAR')
    const defaults: Record<string, string> = {}
    effect.parameters.forEach((p) => {
      defaults[p.name] = p.defaultValue
    })
    setParameters(defaults)
  }, [effect, defaultBeatDivision])

  // Resolve the target property name for display
  const targetPropertyName = useMemo(() => {
    if (!effect) return null
    // For the configure sheet we don't know the exact target property yet,
    // but EffectParameterForm just uses this for display.
    // Return the first compatible property as a hint.
    return effect.compatibleProperties[0] ?? null
  }, [effect])

  const showDistribution = hasGroupTarget

  const handleApply = () => {
    onApply({ beatDivision, blendMode, phaseOffset, distribution, parameters })
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{effect?.name ?? 'Configure Effect'}</SheetTitle>
          <SheetDescription>Customise parameters before applying</SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {effect && (
            <EffectParameterForm
              effect={effect}
              beatDivision={beatDivision}
              onBeatDivisionChange={setBeatDivision}
              blendMode={blendMode}
              onBlendModeChange={setBlendMode}
              phaseOffset={phaseOffset}
              onPhaseOffsetChange={setPhaseOffset}
              startOnBeat={false}
              onStartOnBeatChange={() => {}}
              showStartOnBeat={false}
              parameters={parameters}
              onParametersChange={setParameters}
              targetPropertyName={targetPropertyName}
              isEdit={false}
              distributionStrategy={distribution}
              onDistributionStrategyChange={setDistribution}
              showDistribution={showDistribution}
            />
          )}
        </div>

        <SheetFooter className="flex-row gap-2 sm:flex-row">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleApply} className="flex-1">
            Apply
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

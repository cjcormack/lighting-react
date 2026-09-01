import { useState, useEffect, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetBody,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { EffectParameterForm } from '@/components/fx/EffectParameterForm'
import type { ExtendedChannelFlags } from '@/components/fx/colourUtils'
import type { EffectLibraryEntry } from '@/store/fixtureFx'

interface ConfigureEffectSheetProps {
  effect: EffectLibraryEntry | null
  defaultBeatDivision: number
  /**
   * Where a plain pad press would have put this effect — the master whose usage matches the
   * effect's family, or null for master 1. Seeding the picker with it is what makes the routing
   * visible at the moment of the press; the operator can override, and then the sheet sends
   * that choice explicitly.
   */
  defaultSpeedMasterUuid?: string | null
  /** Caption under the speed picker explaining that seed. Absent when routing didn't match. */
  speedMasterDescription?: string
  /**
   * Default wall-clock rate master (uuid; null → unscaled). Not routed by usage — a rate scale
   * is a deliberate binding rather than a default worth guessing.
   */
  defaultRateSpeedMasterUuid?: string | null
  onApply: (params: {
    beatDivision: number
    blendMode: string
    phaseOffset: number
    distribution: string
    elementMode?: string
    stepTiming?: boolean
    parameters: Record<string, string>
    speedMasterUuid?: string
    rateSpeedMasterUuid?: string
  }) => void
  onClose: () => void
  /** Whether to show the distribution strategy selector */
  showDistribution: boolean
  /** Whether to show the element mode selector (multi-head fixtures) */
  showElementMode: boolean
  /** Extended colour channels available on the target */
  extendedChannels?: ExtendedChannelFlags
}

export function ConfigureEffectSheet({
  effect,
  defaultBeatDivision,
  defaultSpeedMasterUuid = null,
  speedMasterDescription,
  defaultRateSpeedMasterUuid = null,
  onApply,
  onClose,
  showDistribution,
  showElementMode,
  extendedChannels,
}: ConfigureEffectSheetProps) {
  const isOpen = effect !== null

  const [beatDivision, setBeatDivision] = useState(defaultBeatDivision)
  const [blendMode, setBlendMode] = useState('OVERRIDE')
  const [phaseOffset, setPhaseOffset] = useState(0)
  const [distribution, setDistribution] = useState('LINEAR')
  const [elementMode, setElementMode] = useState('PER_FIXTURE')
  const [stepTiming, setStepTiming] = useState(false)
  const [speedMasterUuid, setSpeedMasterUuid] = useState<string | null>(defaultSpeedMasterUuid)
  const [rateSpeedMasterUuid, setRateSpeedMasterUuid] = useState<string | null>(
    defaultRateSpeedMasterUuid,
  )
  const [parameters, setParameters] = useState<Record<string, string>>({})

  // The three seeds, read through a ref so that only *opening an effect* resets the form.
  //
  // `defaultSpeedMasterUuid` is derived from the live speed-master bank now that a press is routed
  // by usage, so it moves on its own: any `speedMasters.listChanged` that retags a master (another
  // tab, the manage page, an import) changes it. Had it stayed a dependency below, that would fire
  // the reset mid-edit and silently throw away the parameters, blend mode and phase the operator
  // had already dialled in on the open sheet.
  const seedsRef = useRef({
    defaultBeatDivision,
    defaultSpeedMasterUuid,
    defaultRateSpeedMasterUuid,
  })
  seedsRef.current = { defaultBeatDivision, defaultSpeedMasterUuid, defaultRateSpeedMasterUuid }

  // Reset state when a new effect is opened. `effect` goes back to null on close, so reopening
  // the same library entry is still a fresh identity and still re-seeds.
  useEffect(() => {
    if (!effect) return
    const seeds = seedsRef.current
    setBeatDivision(seeds.defaultBeatDivision)
    setBlendMode('OVERRIDE')
    setPhaseOffset(0)
    setDistribution('LINEAR')
    setElementMode('PER_FIXTURE')
    setStepTiming(false)
    setSpeedMasterUuid(seeds.defaultSpeedMasterUuid)
    setRateSpeedMasterUuid(seeds.defaultRateSpeedMasterUuid)
    const defaults: Record<string, string> = {}
    effect.parameters.forEach((p) => {
      defaults[p.name] = p.defaultValue
    })
    setParameters(defaults)
  }, [effect])

  // Only said while the picker still holds the seed the routing put there. Once the operator has
  // overridden it, "routed by usage" would be captioning a master that is no longer selected.
  const routingNote =
    speedMasterUuid === defaultSpeedMasterUuid ? speedMasterDescription : undefined

  // Resolve the target property name for display
  const targetPropertyName = useMemo(() => {
    if (!effect) return null
    // For the configure sheet we don't know the exact target property yet,
    // but EffectParameterForm just uses this for display.
    // Return the first compatible property as a hint.
    return effect.compatibleProperties[0] ?? null
  }, [effect])

  const handleApply = () => {
    onApply({
      beatDivision,
      blendMode,
      phaseOffset,
      distribution,
      ...(showElementMode ? { elementMode } : {}),
      stepTiming,
      parameters,
      ...(speedMasterUuid != null ? { speedMasterUuid } : {}),
      ...(rateSpeedMasterUuid != null ? { rateSpeedMasterUuid } : {}),
    })
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{effect?.name ?? 'Configure Effect'}</SheetTitle>
          <SheetDescription>Customise parameters before applying</SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-0 p-0">
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
              elementMode={elementMode}
              onElementModeChange={setElementMode}
              showElementMode={showElementMode}
              extendedChannels={effect.category === 'colour' ? extendedChannels : undefined}
              stepTiming={stepTiming}
              onStepTimingChange={setStepTiming}
              speedMasterUuid={speedMasterUuid}
              onSpeedMasterChange={setSpeedMasterUuid}
              speedMasterDescription={routingNote}
              rateSpeedMasterUuid={rateSpeedMasterUuid}
              onRateSpeedMasterChange={setRateSpeedMasterUuid}
            />
          )}
        </SheetBody>

        <SheetFooter className="flex-row gap-2">
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

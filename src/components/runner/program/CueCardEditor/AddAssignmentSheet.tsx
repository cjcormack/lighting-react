import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
  SheetFooter,
} from '@/components/ui/sheet'
import { CueTargetPicker } from '@/components/cues/CueTargetPicker'
import {
  useTargetProperties,
  defaultValueFor,
  placeholderFor,
  type AvailableProperty,
} from '@/components/cues/editor/targetProperties'
import type {
  Cue,
  CuePropertyAssignment,
  CueTarget,
} from '@/api/cuesApi'

interface AddAssignmentSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cue: Cue
  defaultTarget: CueTarget | null
  onAdd: (assignment: CuePropertyAssignment) => void
}

type Step = 'target' | 'property' | 'value'

/**
 * Right-hand sheet for adding a Layer 3 property assignment. Three steps:
 * pick target (skipped when defaultTarget is supplied), pick property,
 * enter value + fade override + (for `position`) move-in-dark.
 */
export function AddAssignmentSheet({
  open,
  onOpenChange,
  cue,
  defaultTarget,
  onAdd,
}: AddAssignmentSheetProps) {
  const [target, setTarget] = useState<CueTarget | null>(defaultTarget)
  const [step, setStep] = useState<Step>(defaultTarget ? 'property' : 'target')

  // Reset state when reopened
  useEffect(() => {
    if (!open) return
    setTarget(defaultTarget)
    setStep(defaultTarget ? 'property' : 'target')
    setPropertyName('')
    setValue('')
    setFadeMs('')
    setMoveInDark(false)
  }, [open, defaultTarget])

  const properties = useTargetProperties(target)
  const usedPropertyNames = useMemo(() => {
    if (!target) return new Set<string>()
    return new Set(
      cue.propertyAssignments
        .filter((a) => a.targetType === target.type && a.targetKey === target.key)
        .map((a) => a.propertyName),
    )
  }, [cue.propertyAssignments, target])

  const addableProperties = useMemo(
    () => properties.filter((p) => !usedPropertyNames.has(p.name)),
    [properties, usedPropertyNames],
  )

  const [propertyName, setPropertyName] = useState('')
  const selectedProp = useMemo(
    () => properties.find((p) => p.name === propertyName) ?? null,
    [properties, propertyName],
  )

  const [value, setValue] = useState('')
  const [fadeMs, setFadeMs] = useState('')
  const [moveInDark, setMoveInDark] = useState(false)

  const handleTargetSelect = (t: CueTarget) => {
    setTarget(t)
    setStep('property')
  }

  const handlePropertySelect = (p: AvailableProperty) => {
    setPropertyName(p.name)
    setValue(defaultValueFor(p))
    setStep('value')
  }

  const canSubmit =
    target != null && propertyName.length > 0 && value.trim().length > 0

  const handleSubmit = () => {
    if (!canSubmit || !target) return
    const fade = fadeMs.trim() ? Number(fadeMs.trim()) : null
    onAdd({
      targetType: target.type,
      targetKey: target.key,
      propertyName,
      value: value.trim(),
      fadeDurationMs: Number.isFinite(fade as number) ? (fade as number | null) : null,
      moveInDark: propertyName === 'position' ? moveInDark : undefined,
    })
  }

  const back = () => {
    if (step === 'value') setStep('property')
    else if (step === 'property') {
      if (defaultTarget) onOpenChange(false)
      else setStep('target')
    } else {
      onOpenChange(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-lg flex flex-col p-0"
      >
        <SheetHeader className="border-b">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 -ml-1"
              onClick={back}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <SheetTitle>
              {step === 'target' && 'Add assignment — choose target'}
              {step === 'property' &&
                `Add assignment${target ? ` — ${target.key}` : ''}`}
              {step === 'value' &&
                `${selectedProp?.displayName ?? propertyName} on ${target?.key ?? ''}`}
            </SheetTitle>
          </div>
        </SheetHeader>

        <SheetBody className="px-0 pt-0">
          {step === 'target' && <CueTargetPicker onSelect={handleTargetSelect} />}

          {step === 'property' && target && (
            <div className="p-3 space-y-1">
              {addableProperties.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  All available properties already have assignments on this target.
                </p>
              )}
              {addableProperties.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => handlePropertySelect(p)}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded border bg-card hover:bg-muted/40 text-left"
                >
                  <span className="font-mono text-[10px] text-muted-foreground w-16 shrink-0 truncate">
                    {p.name}
                  </span>
                  <span className="flex-1 text-sm font-medium truncate">
                    {p.displayName}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {p.type}
                  </span>
                </button>
              ))}
            </div>
          )}

          {step === 'value' && selectedProp && target && (
            <div className="p-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="asg-value">
                  Value{' '}
                  <span className="text-muted-foreground text-[10px]">
                    ({selectedProp.type})
                  </span>
                </Label>
                <Input
                  id="asg-value"
                  className="h-9 font-mono"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={placeholderFor(selectedProp)}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="asg-fade">Fade override (ms)</Label>
                <Input
                  id="asg-fade"
                  type="number"
                  min="0"
                  step="100"
                  className="h-9 font-mono"
                  value={fadeMs}
                  onChange={(e) => setFadeMs(e.target.value)}
                  placeholder="(use cue fade)"
                />
              </div>

              {selectedProp.name === 'position' && (
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={moveInDark}
                    onChange={(e) => setMoveInDark(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">Move in dark</span>
                    <span className="text-muted-foreground ml-1">
                      Pre-apply pan/tilt during a fade out from the previous cue.
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}
        </SheetBody>

        {step === 'value' && (
          <SheetFooter className="border-t flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!canSubmit} onClick={handleSubmit}>
              Add
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}


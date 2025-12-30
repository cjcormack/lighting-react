import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select"
import {
  EffectType,
  BlendMode,
  DistributionStrategy,
  DimmerEffectType,
  ColourEffectType,
  PositionEffectType,
} from "../../api/groupsApi"
import { useApplyGroupFxMutation, useDistributionStrategiesQuery } from "../../store/groups"

interface AddFxDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupName: string
  capabilities: string[]
}

const DIMMER_EFFECTS: DimmerEffectType[] = [
  "sinewave",
  "pulse",
  "rampup",
  "rampdown",
  "triangle",
  "squarewave",
  "strobe",
  "flicker",
  "breathe",
]

const COLOUR_EFFECTS: ColourEffectType[] = [
  "rainbowcycle",
  "colourstrobe",
  "colourpulse",
  "colourfade",
  "colourflicker",
]

const POSITION_EFFECTS: PositionEffectType[] = [
  "circle",
  "figure8",
  "sweep",
  "pansweep",
  "tiltsweep",
  "randomposition",
]

const BLEND_MODES: BlendMode[] = ["OVERRIDE", "ADDITIVE", "MULTIPLY", "MAX", "MIN"]

const PROPERTY_OPTIONS: Record<string, string[]> = {
  dimmer: ["dimmer"],
  colour: ["colour", "red", "green", "blue", "white", "amber", "uv"],
  position: ["position", "pan", "tilt"],
  uv: ["uv"],
  strobe: ["strobe"],
}

const BEAT_DIVISION_PRESETS = [
  { label: "1/4", value: 0.25 },
  { label: "1/2", value: 0.5 },
  { label: "1", value: 1 },
  { label: "2", value: 2 },
  { label: "4", value: 4 },
  { label: "8", value: 8 },
  { label: "16", value: 16 },
]

export function AddFxDialog({
  open,
  onOpenChange,
  groupName,
  capabilities,
}: AddFxDialogProps) {
  const [effectType, setEffectType] = useState<EffectType | "">("")
  const [propertyName, setPropertyName] = useState("")
  const [beatDivision, setBeatDivision] = useState(1)
  const [blendMode, setBlendMode] = useState<BlendMode>("OVERRIDE")
  const [distribution, setDistribution] = useState<DistributionStrategy>("LINEAR")
  const [phaseOffset, setPhaseOffset] = useState(0)
  const [minValue, setMinValue] = useState("0")
  const [maxValue, setMaxValue] = useState("255")

  const { data: strategiesData } = useDistributionStrategiesQuery()
  const [applyFx, { isLoading }] = useApplyGroupFxMutation()

  const strategies = strategiesData?.strategies ?? [
    "LINEAR",
    "UNIFIED",
    "CENTER_OUT",
    "EDGES_IN",
    "REVERSE",
    "SPLIT",
    "PING_PONG",
    "RANDOM",
    "POSITIONAL",
  ]

  // Determine effect category from selected effect
  const getEffectCategory = (effect: EffectType): string => {
    if (DIMMER_EFFECTS.includes(effect as DimmerEffectType)) return "dimmer"
    if (COLOUR_EFFECTS.includes(effect as ColourEffectType)) return "colour"
    if (POSITION_EFFECTS.includes(effect as PositionEffectType)) return "position"
    return "dimmer"
  }

  // Get available properties based on capabilities and effect type
  const getAvailableProperties = (): string[] => {
    if (!effectType) return []
    const category = getEffectCategory(effectType)
    const props = PROPERTY_OPTIONS[category] ?? []
    return props
  }

  const hasDimmerCapability = capabilities.some(
    (c) => c.toLowerCase() === "dimmer"
  )
  const hasColourCapability = capabilities.some(
    (c) => c.toLowerCase() === "colour"
  )
  const hasPositionCapability = capabilities.some(
    (c) => c.toLowerCase() === "position"
  )

  const handleApply = async () => {
    if (!effectType || !propertyName) return

    try {
      await applyFx({
        groupName,
        effectType,
        propertyName,
        beatDivision,
        blendMode,
        distribution,
        phaseOffset,
        parameters: {
          min: minValue,
          max: maxValue,
        },
      }).unwrap()

      // Reset and close
      resetForm()
      onOpenChange(false)
    } catch (error) {
      console.error("Failed to apply effect:", error)
    }
  }

  const resetForm = () => {
    setEffectType("")
    setPropertyName("")
    setBeatDivision(1)
    setBlendMode("OVERRIDE")
    setDistribution("LINEAR")
    setPhaseOffset(0)
    setMinValue("0")
    setMaxValue("255")
  }

  const handleClose = () => {
    resetForm()
    onOpenChange(false)
  }

  const availableProperties = getAvailableProperties()

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Effect to {groupName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Effect Type */}
          <div className="space-y-2">
            <Label>Effect Type</Label>
            <Select
              value={effectType}
              onValueChange={(v) => {
                setEffectType(v as EffectType)
                setPropertyName("")
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an effect" />
              </SelectTrigger>
              <SelectContent>
                {hasDimmerCapability && (
                  <SelectGroup>
                    <SelectLabel>Dimmer Effects</SelectLabel>
                    {DIMMER_EFFECTS.map((e) => (
                      <SelectItem key={e} value={e} className="capitalize">
                        {e}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {hasColourCapability && (
                  <SelectGroup>
                    <SelectLabel>Colour Effects</SelectLabel>
                    {COLOUR_EFFECTS.map((e) => (
                      <SelectItem key={e} value={e} className="capitalize">
                        {e}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {hasPositionCapability && (
                  <SelectGroup>
                    <SelectLabel>Position Effects</SelectLabel>
                    {POSITION_EFFECTS.map((e) => (
                      <SelectItem key={e} value={e} className="capitalize">
                        {e}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Property Name */}
          {effectType && (
            <div className="space-y-2">
              <Label>Property</Label>
              <Select value={propertyName} onValueChange={setPropertyName}>
                <SelectTrigger>
                  <SelectValue placeholder="Select property" />
                </SelectTrigger>
                <SelectContent>
                  {availableProperties.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Beat Division */}
          <div className="space-y-2">
            <Label>Beat Division: {beatDivision}</Label>
            <div className="flex gap-1 flex-wrap">
              {BEAT_DIVISION_PRESETS.map((preset) => (
                <Button
                  key={preset.value}
                  variant={beatDivision === preset.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setBeatDivision(preset.value)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Blend Mode */}
          <div className="space-y-2">
            <Label>Blend Mode</Label>
            <Select
              value={blendMode}
              onValueChange={(v) => setBlendMode(v as BlendMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BLEND_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Distribution */}
          <div className="space-y-2">
            <Label>Distribution</Label>
            <Select
              value={distribution}
              onValueChange={(v) => setDistribution(v as DistributionStrategy)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {strategies.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Phase Offset */}
          <div className="space-y-2">
            <Label>Phase Offset: {phaseOffset.toFixed(0)}</Label>
            <Slider
              value={[phaseOffset]}
              min={0}
              max={360}
              step={15}
              onValueChange={([v]) => setPhaseOffset(v)}
            />
          </div>

          {/* Min/Max Values (for dimmer effects) */}
          {effectType && DIMMER_EFFECTS.includes(effectType as DimmerEffectType) && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min Value</Label>
                <Input
                  type="number"
                  value={minValue}
                  onChange={(e) => setMinValue(e.target.value)}
                  min={0}
                  max={255}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Value</Label>
                <Input
                  type="number"
                  value={maxValue}
                  onChange={(e) => setMaxValue(e.target.value)}
                  min={0}
                  max={255}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={!effectType || !propertyName || isLoading}
          >
            {isLoading ? "Applying..." : "Apply Effect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

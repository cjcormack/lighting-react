import { useState, useCallback, useEffect } from 'react'
import { HexColorPicker } from 'react-colorful'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import {
  resolveColourToHex,
  parseExtendedColour,
  serializeExtendedColour,
  isValidHexColour,
  isPaletteRef,
  resolveColourWithPalette,
  COLOUR_PRESETS,
  type ExtendedColour,
} from './colourUtils'
import { useFxStateQuery } from '@/store/fx'

interface FxColourPickerProps {
  value: string
  onChange: (value: string) => void
  label?: string
  description?: string
  /** Which extended channels to show (based on target fixture capabilities) */
  extendedChannels?: {
    white?: boolean
    amber?: boolean
    uv?: boolean
  }
  /** Override palette (e.g. cue palette). Falls back to global FxState palette. */
  palette?: string[]
}

export function FxColourPicker({
  value,
  onChange,
  label,
  description,
  extendedChannels,
  palette: paletteProp,
}: FxColourPickerProps) {
  const { data: fxState } = useFxStateQuery()
  const palette = paletteProp ?? fxState?.palette ?? []
  const isPalRef = isPaletteRef(value)

  const [isOpen, setIsOpen] = useState(false)
  const [localColour, setLocalColour] = useState<ExtendedColour>(() => parseExtendedColour(value))
  const [hexInput, setHexInput] = useState(() => isPaletteRef(value) ? value.trim() : resolveColourToHex(value))

  // Sync from parent value when popover opens
  useEffect(() => {
    if (isOpen) {
      if (isPaletteRef(value)) {
        setHexInput(value.trim())
        // Resolve palette ref for the picker display
        const resolved = resolveColourWithPalette(value, palette)
        setLocalColour(parseExtendedColour(resolved))
      } else {
        const parsed = parseExtendedColour(value)
        setLocalColour(parsed)
        setHexInput(parsed.hex)
      }
    }
  }, [isOpen, value, palette])

  const emitChange = useCallback(
    (colour: ExtendedColour) => {
      setLocalColour(colour)
      onChange(serializeExtendedColour(colour))
    },
    [onChange]
  )

  const handleHexChange = useCallback(
    (hex: string) => {
      setHexInput(hex)
      // Check for palette ref input (e.g., "P1", "P2")
      if (isPaletteRef(hex)) {
        onChange(hex.trim().toUpperCase())
        return
      }
      // Only emit when valid to avoid intermediate states
      const normalized = hex.startsWith('#') ? hex : `#${hex}`
      if (isValidHexColour(normalized)) {
        emitChange({ ...localColour, hex: normalized.toLowerCase() })
      }
    },
    [emitChange, localColour, onChange]
  )

  const handlePickerChange = useCallback(
    (hex: string) => {
      const lower = hex.toLowerCase()
      setHexInput(lower)
      emitChange({ ...localColour, hex: lower })
    },
    [emitChange, localColour]
  )

  const handlePresetClick = useCallback(
    (hex: string) => {
      setHexInput(hex)
      emitChange({ ...localColour, hex })
    },
    [emitChange, localColour]
  )

  const handleExtendedChange = useCallback(
    (channel: 'white' | 'amber' | 'uv', val: number) => {
      emitChange({ ...localColour, [channel]: val })
    },
    [emitChange, localColour]
  )

  const hasExtended =
    extendedChannels?.white || extendedChannels?.amber || extendedChannels?.uv

  const displayHex = isPalRef ? resolveColourWithPalette(value, palette) : resolveColourToHex(value)

  return (
    <div>
      {label && <Label className="text-xs mb-1.5 block">{label}</Label>}
      {description && (
        <p className="text-[11px] text-muted-foreground mb-1">{description}</p>
      )}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 h-8 px-2 rounded-md border border-input bg-background text-xs hover:bg-accent/50 transition-colors"
          >
            <span
              className="w-5 h-5 rounded border border-border shrink-0 relative"
              style={{ backgroundColor: displayHex }}
            >
              {isPalRef && (
                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]">
                  {value.trim().toUpperCase()}
                </span>
              )}
            </span>
            <span className="font-mono text-muted-foreground">
              {isPalRef ? value.trim().toUpperCase() : displayHex}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start" side="right">
          <div className="space-y-3">
            {/* Colour picker */}
            <HexColorPicker color={localColour.hex} onChange={handlePickerChange} />

            {/* Hex input */}
            <input
              type="text"
              value={hexInput}
              onChange={(e) => handleHexChange(e.target.value)}
              className="w-full h-7 px-2 text-xs font-mono rounded border border-input bg-background"
              spellCheck={false}
            />

            {/* Quick presets */}
            <div className="flex gap-1 flex-wrap">
              {COLOUR_PRESETS.map((preset) => (
                <button
                  key={preset.hex}
                  type="button"
                  title={preset.name}
                  className="w-5 h-5 rounded border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: preset.hex }}
                  onClick={() => handlePresetClick(preset.hex)}
                />
              ))}
            </div>

            {/* Palette references */}
            {palette.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {palette.map((colour, i) => {
                  const ref = `P${i + 1}`
                  return (
                    <button
                      key={ref}
                      type="button"
                      title={ref}
                      className="w-5 h-5 rounded border border-border hover:scale-110 transition-transform relative overflow-hidden"
                      style={{ backgroundColor: resolveColourToHex(colour) }}
                      onClick={() => {
                        setHexInput(ref)
                        onChange(ref)
                      }}
                    >
                      <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]">
                        {ref}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Extended channels (W/A/UV) */}
            {hasExtended && (
              <div className="space-y-2 pt-2 border-t border-border">
                {extendedChannels?.white && (
                  <ExtendedChannelSlider
                    label="White"
                    value={localColour.white}
                    onChange={(v) => handleExtendedChange('white', v)}
                    color="#fffbe6"
                  />
                )}
                {extendedChannels?.amber && (
                  <ExtendedChannelSlider
                    label="Amber"
                    value={localColour.amber}
                    onChange={(v) => handleExtendedChange('amber', v)}
                    color="#ffbf00"
                  />
                )}
                {extendedChannels?.uv && (
                  <ExtendedChannelSlider
                    label="UV"
                    value={localColour.uv}
                    onChange={(v) => handleExtendedChange('uv', v)}
                    color="#7f00ff"
                  />
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function ExtendedChannelSlider({
  label,
  value,
  onChange,
  color,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  color: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] flex items-center gap-1">
          <span
            className="inline-block w-2 h-2 rounded-full border border-border"
            style={{ backgroundColor: color }}
          />
          {label}
        </span>
        <span className="text-[11px] text-muted-foreground font-mono">{value}</span>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={255}
        step={1}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  )
}

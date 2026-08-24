import { useState, useCallback, useEffect } from 'react'
import { HexColorPicker } from 'react-colorful'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { ExtendedChannelSlider } from '../fixtures/ExtendedChannelSlider'
import {
  resolveColourToHex,
  parseExtendedColour,
  serializeExtendedColour,
  isValidHexColour,
  isTemplateRef,
  parseTemplateRefUuid,
  COLOUR_PRESETS,
  type ExtendedColour,
} from './colourUtils'
import { FxColourTemplateRow, useColourTemplates } from './FxColourTemplates'

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
}

export function FxColourPicker({
  value,
  onChange,
  label,
  description,
  extendedChannels,
}: FxColourPickerProps) {
  const { templates, labelFor, swatchFor } = useColourTemplates()
  const isRef = isTemplateRef(value)

  const [isOpen, setIsOpen] = useState(false)
  const [localColour, setLocalColour] = useState<ExtendedColour>(() => parseExtendedColour(value))
  // A reference has no literal to read at mount and the template list has not arrived yet, so this
  // seeds to black either way; the open effect below re-seeds from the resolved colour, and the
  // field is only rendered inside the popover.
  const [hexInput, setHexInput] = useState(() => resolveColourToHex(value))

  // Sync from parent value when the popover opens.
  //
  // A reference opens at the colour the template *currently* resolves to, so dragging the picker
  // starts from where the rig is rather than from black — the same rule Local's unset cells follow.
  // Touching the picker then replaces the reference with a literal, which is the honest reading of
  // "I want this colour, not that template".
  useEffect(() => {
    if (isOpen) {
      const resolved = isTemplateRef(value) ? swatchFor(value) : null
      const parsed = parseExtendedColour(resolved ?? value)
      setLocalColour(parsed)
      setHexInput(parsed.hex)
    }
  }, [isOpen, value, swatchFor])

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
      // Only emit when valid to avoid intermediate states
      const normalized = hex.startsWith('#') ? hex : `#${hex}`
      if (isValidHexColour(normalized)) {
        emitChange({ ...localColour, hex: normalized.toLowerCase() })
      }
    },
    [emitChange, localColour]
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

  const refSwatch = isRef ? swatchFor(value) : null
  const displayHex = refSwatch ?? resolveColourToHex(value)
  const refLabel = isRef ? labelFor(value) : null

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
              className="w-5 h-5 rounded border border-border shrink-0"
              style={{ backgroundColor: displayHex }}
            />
            {/* A reference shows the template's **name**, never a short code — same rule as
                `LookNameBadge`. The name is the whole point of referencing one. */}
            <span className={refLabel ? 'truncate max-w-[9rem]' : 'font-mono text-muted-foreground'}>
              {refLabel ?? displayHex}
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

            <FxColourTemplateRow
              templates={templates}
              currentHex={localColour.hex}
              selectedUuid={parseTemplateRefUuid(value)}
              onPick={onChange}
            />

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

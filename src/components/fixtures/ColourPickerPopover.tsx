import { useState, useCallback, useRef, useEffect } from 'react'
import { RgbColorPicker, type RgbColor } from 'react-colorful'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { ExtendedChannelSlider } from './ExtendedChannelSlider'

interface ColourPickerPopoverProps {
  /** Current RGB channel values */
  r: number
  g: number
  b: number
  /** Current extended channel values (undefined when fixture lacks the channel) */
  w?: number
  a?: number
  uv?: number
  /** Combined preview CSS colour (includes W/A/UV effect) */
  combinedCss: string
  /** Whether the fixture has extended channels */
  hasWhiteChannel: boolean
  hasAmberChannel: boolean
  hasUvChannel: boolean
  /** Callback when colour is picked */
  onColourChange: (r: number, g: number, b: number, w?: number, a?: number, uv?: number) => void
  /** The trigger element (swatch) */
  children: React.ReactNode
}

function isExactWhite(color: RgbColor): boolean {
  return color.r === 255 && color.g === 255 && color.b === 255
}

/** Parse an rgb() or other CSS colour string to RGB values */
function parseCssColour(css: string): RgbColor {
  // Handle rgb(r, g, b) format
  const rgbMatch = css.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
    }
  }
  // Fallback to black
  return { r: 0, g: 0, b: 0 }
}

export function ColourPickerPopover({
  r,
  g,
  b,
  w,
  a,
  uv,
  combinedCss,
  hasWhiteChannel,
  hasAmberChannel,
  hasUvChannel,
  onColourChange,
  children,
}: ColourPickerPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  // Track the picker's internal colour state (initialized from combined preview)
  const [pickerColor, setPickerColor] = useState<RgbColor>(() => parseCssColour(combinedCss))
  // Track if user has made a change since opening
  const hasChangedRef = useRef(false)

  // Reset picker colour to combined preview when popover opens
  useEffect(() => {
    if (isOpen) {
      setPickerColor(parseCssColour(combinedCss))
      hasChangedRef.current = false
    }
  }, [isOpen, combinedCss])

  const handleColourChange = useCallback(
    (color: RgbColor) => {
      setPickerColor(color)
      hasChangedRef.current = true

      if (isExactWhite(color) && hasWhiteChannel) {
        // White selected: use white LED, zero out RGB and extended channels
        onColourChange(
          0,
          0,
          0,
          255,
          hasAmberChannel ? 0 : undefined,
          hasUvChannel ? 0 : undefined
        )
      } else {
        // Non-white: set RGB, zero out W/A/UV
        onColourChange(
          color.r,
          color.g,
          color.b,
          hasWhiteChannel ? 0 : undefined,
          hasAmberChannel ? 0 : undefined,
          hasUvChannel ? 0 : undefined
        )
      }
    },
    [onColourChange, hasWhiteChannel, hasAmberChannel, hasUvChannel]
  )

  const handleExtendedChange = useCallback(
    (channel: 'w' | 'a' | 'uv', value: number) => {
      onColourChange(
        r,
        g,
        b,
        hasWhiteChannel ? (channel === 'w' ? value : w ?? 0) : undefined,
        hasAmberChannel ? (channel === 'a' ? value : a ?? 0) : undefined,
        hasUvChannel ? (channel === 'uv' ? value : uv ?? 0) : undefined
      )
    },
    [onColourChange, r, g, b, w, a, uv, hasWhiteChannel, hasAmberChannel, hasUvChannel]
  )

  const hasExtendedChannels = hasWhiteChannel || hasAmberChannel || hasUvChannel

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-auto" align="start">
        <div className="space-y-3">
          <RgbColorPicker color={pickerColor} onChange={handleColourChange} />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-mono">
              R:{r} G:{g} B:{b}
            </span>
            {hasWhiteChannel && (
              <span className="text-muted-foreground/60">White = use white LED</span>
            )}
          </div>
          {hasExtendedChannels && (
            <div className="space-y-2 pt-2 border-t border-border">
              {hasWhiteChannel && (
                <ExtendedChannelSlider
                  label="W"
                  value={w ?? 0}
                  onChange={(v) => handleExtendedChange('w', v)}
                  color="#fffbe6"
                />
              )}
              {hasAmberChannel && (
                <ExtendedChannelSlider
                  label="A"
                  value={a ?? 0}
                  onChange={(v) => handleExtendedChange('a', v)}
                  color="#ffbf00"
                />
              )}
              {hasUvChannel && (
                <ExtendedChannelSlider
                  label="UV"
                  value={uv ?? 0}
                  onChange={(v) => handleExtendedChange('uv', v)}
                  color="#7f00ff"
                />
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}


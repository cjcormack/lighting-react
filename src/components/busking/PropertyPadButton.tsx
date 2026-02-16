import { useRef, useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { PropertyButton, EffectPresence } from './buskingTypes'

interface PropertyPadButtonProps {
  button: PropertyButton
  presence: EffectPresence
  activeValue: string | null
  onToggle: (settingLevel?: number) => void
  onLongPress: () => void
}

const HOLD_MS = 300

export function PropertyPadButton({
  button,
  presence,
  activeValue,
  onToggle,
  onLongPress,
}: PropertyPadButtonProps) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)
  const buttonElRef = useRef<HTMLButtonElement>(null)

  // Slider hold-to-slide state
  const [sliding, setSliding] = useState(false)
  const slidingRef = useRef(false)
  const [sliderValue, setSliderValue] = useState(0)
  const [pendingValue, setPendingValue] = useState<number | null>(null)
  const sliderValueRef = useRef(0)
  const isSlider = button.kind === 'slider'
  const sliderMin = button.min ?? 0
  const sliderMax = button.max ?? 255

  // Setting hold-to-pick state
  const isSettingWithOptions = button.kind === 'setting' && button.options && button.options.length > 0
  const [picking, setPicking] = useState(false)
  const pickingRef = useRef(false)
  const [hoveredLevel, setHoveredLevel] = useState<number | null>(null)
  const [pendingSettingValue, setPendingSettingValue] = useState<number | null>(null)
  const hoveredLevelRef = useRef<number | null>(null)
  const optionRefs = useRef<Map<number, HTMLElement>>(new Map())
  const dropdownRef = useRef<HTMLDivElement>(null)
  const onToggleRef = useRef(onToggle)
  onToggleRef.current = onToggle

  // Keep refs in sync
  sliderValueRef.current = sliderValue
  hoveredLevelRef.current = hoveredLevel
  pickingRef.current = picking
  slidingRef.current = sliding

  // Clear pendingValue once activeValue catches up (sliders)
  useEffect(() => {
    if (pendingValue !== null && activeValue !== null && Number(activeValue) === pendingValue) {
      setPendingValue(null)
    }
  }, [activeValue, pendingValue])

  // Clear pendingSettingValue once activeValue catches up (settings)
  useEffect(() => {
    if (pendingSettingValue !== null && activeValue !== null && Number(activeValue) === pendingSettingValue) {
      setPendingSettingValue(null)
    }
  }, [activeValue, pendingSettingValue])

  // Resolve display value for the subtitle
  const displayValue = (() => {
    if (pendingValue !== null) return String(pendingValue)
    if (pendingSettingValue !== null && button.options) {
      const option = button.options.find((o) => o.level === pendingSettingValue)
      return option?.displayName ?? String(pendingSettingValue)
    }
    if (!activeValue) return null
    if (button.kind === 'setting' && button.options) {
      const level = Number(activeValue)
      const option = button.options.find((o) => o.level === level)
      return option?.displayName ?? activeValue
    }
    return activeValue
  })()

  const clearTimer = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }, [])

  const closePicker = useCallback(() => {
    setPicking(false)
    setHoveredLevel(null)
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      didLongPress.current = false

      // If the picker is already open, don't start a new hold timer —
      // pointerUp will handle tapping the button to close it
      if (pickingRef.current) {
        return
      }

      if (isSlider) {
        const el = buttonElRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
        const initialValue = Math.round(sliderMin + fraction * (sliderMax - sliderMin))

        pressTimer.current = setTimeout(() => {
          didLongPress.current = true
          setSliderValue(initialValue)
          setSliding(true)
        }, HOLD_MS)
      } else if (isSettingWithOptions) {
        pressTimer.current = setTimeout(() => {
          didLongPress.current = true
          setHoveredLevel(null)
          setPicking(true)

          // Register global listeners synchronously so they catch the current pointerup
          const handleMove = (ev: PointerEvent) => {
            let found: number | null = null
            for (const [level, el] of optionRefs.current) {
              const rect = el.getBoundingClientRect()
              if (
                ev.clientX >= rect.left &&
                ev.clientX <= rect.right &&
                ev.clientY >= rect.top &&
                ev.clientY <= rect.bottom
              ) {
                found = level
                break
              }
            }
            setHoveredLevel(found)
          }

          const handleUp = () => {
            cleanup()
            const level = hoveredLevelRef.current
            if (level !== null) {
              setPicking(false)
              setHoveredLevel(null)
              setPendingSettingValue(level)
              onToggleRef.current(level)
            }
            // else: released without hovering an option — keep dropdown open for tapping
          }

          const cleanup = () => {
            window.removeEventListener('pointermove', handleMove)
            window.removeEventListener('pointerup', handleUp)
          }

          window.addEventListener('pointermove', handleMove)
          window.addEventListener('pointerup', handleUp)
        }, HOLD_MS)
      } else {
        pressTimer.current = setTimeout(() => {
          didLongPress.current = true
          if (presence !== 'none') {
            onLongPress()
          }
        }, 500)
      }
    },
    [isSlider, isSettingWithOptions, sliderMin, sliderMax, presence, onLongPress],
  )

  const handlePointerUp = useCallback(() => {
    clearTimer()

    if (slidingRef.current) {
      const val = sliderValueRef.current
      setSliding(false)
      setPendingValue(val)
      onToggle(val)
      return
    }

    if (pickingRef.current) {
      // If this pointerUp ends the same long press that just opened the picker,
      // don't close it — the global listener already handled the release.
      // Only close if this is a fresh tap on the button while the picker is already open.
      if (!didLongPress.current) {
        closePicker()
      }
      return
    }

    if (isSettingWithOptions) {
      if (didLongPress.current) return
      if (presence !== 'none') {
        onToggle()
      } else {
        setPicking(true)
      }
      return
    }

    if (didLongPress.current) return
    onToggle()
  }, [clearTimer, isSettingWithOptions, presence, onToggle, closePicker])

  const handlePointerLeave = useCallback(() => {
    if (slidingRef.current || pickingRef.current) return
    clearTimer()
  }, [clearTimer])

  // Global pointer move/up while sliding (slider)
  useEffect(() => {
    if (!sliding) return

    const handleMove = (e: PointerEvent) => {
      const el = buttonElRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
      const newValue = Math.round(sliderMin + fraction * (sliderMax - sliderMin))
      setSliderValue(newValue)
    }

    const handleUp = () => {
      const val = sliderValueRef.current
      setSliding(false)
      setPendingValue(val)
      onToggle(val)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [sliding, sliderMin, sliderMax, onToggle])

  // Close picker on outside click
  useEffect(() => {
    if (!picking) return

    const handleDown = (e: PointerEvent) => {
      const dropdown = dropdownRef.current
      const btn = buttonElRef.current
      if (dropdown && !dropdown.contains(e.target as Node) && btn && !btn.contains(e.target as Node)) {
        setPicking(false)
        setHoveredLevel(null)
      }
    }

    // Small delay so this doesn't catch the pointerdown that just opened the picker
    const timer = setTimeout(() => {
      window.addEventListener('pointerdown', handleDown)
    }, 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', handleDown)
    }
  }, [picking])

  const handleOptionClick = (level: number) => {
    setPicking(false)
    setHoveredLevel(null)
    setPendingSettingValue(level)
    onToggle(level)
  }

  const setOptionRef = useCallback((level: number, el: HTMLElement | null) => {
    if (el) {
      optionRefs.current.set(level, el)
    } else {
      optionRefs.current.delete(level)
    }
  }, [])

  const fillPercent = isSlider
    ? ((sliderValue - sliderMin) / (sliderMax - sliderMin)) * 100
    : 0

  return (
    <div className="relative">
      <button
        ref={buttonElRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        className={cn(
          'relative flex flex-col items-center justify-center rounded-lg border px-2 py-3 text-center transition-all overflow-hidden',
          'min-h-[64px] select-none touch-manipulation w-full',
          !sliding && !picking && 'active:scale-95',
          presence === 'none' && !sliding && !picking && 'border-border bg-card hover:bg-accent/50',
          presence === 'some' && !sliding && !picking && 'border-primary/40 bg-primary/10 hover:bg-primary/15',
          presence === 'all' && !sliding && !picking && 'border-primary bg-primary/20 ring-1 ring-primary/50 hover:bg-primary/25',
          (sliding || picking) && 'border-primary bg-primary/20 ring-1 ring-primary/50',
        )}
      >
        {/* Slider fill indicator */}
        {sliding && (
          <div
            className="absolute inset-y-0 left-0 bg-primary/30"
            style={{ width: `${fillPercent}%` }}
          />
        )}

        <span
          className={cn(
            'relative text-sm font-medium leading-tight',
            presence !== 'none' || sliding || picking ? 'text-primary' : 'text-foreground',
          )}
        >
          {button.displayName}
        </span>

        {sliding ? (
          <span className="relative mt-0.5 text-xs font-bold leading-tight text-primary tabular-nums">
            {sliderValue}
          </span>
        ) : (
          <>
            {displayValue && (
              <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground line-clamp-1">
                {displayValue}
              </span>
            )}
            {!displayValue && (
              <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground line-clamp-1">
                {button.kind === 'setting' ? 'Setting' : 'Slider'}
              </span>
            )}
          </>
        )}

        {/* Presence indicator dot */}
        {presence !== 'none' && !sliding && !picking && (
          <div
            className={cn(
              'absolute top-1.5 right-1.5 size-2 rounded-full',
              presence === 'all' ? 'bg-primary' : 'bg-primary/50',
            )}
          />
        )}
      </button>

      {/* Setting options dropdown — renders below the button */}
      {picking && isSettingWithOptions && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border bg-popover shadow-md p-1 animate-in fade-in-0 zoom-in-95 duration-100"
        >
          <div className="flex flex-col">
            {button.options!.map((option) => (
              <div
                key={option.level}
                ref={(el) => setOptionRef(option.level, el)}
                onClick={() => handleOptionClick(option.level)}
                className={cn(
                  'flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors text-left cursor-default',
                  hoveredLevel === option.level && 'bg-accent text-accent-foreground',
                  hoveredLevel !== option.level && activeValue !== null && Number(activeValue) === option.level && 'text-primary font-medium',
                )}
              >
                {option.colourPreview && (
                  <span
                    className="size-3 rounded-full border shrink-0"
                    style={{ backgroundColor: option.colourPreview }}
                  />
                )}
                <span className="truncate">{option.displayName}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

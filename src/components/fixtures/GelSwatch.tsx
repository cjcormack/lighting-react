import type { SliderPropertyDescriptor } from '../../store/fixtures'
import { useSliderValue } from '../../hooks/usePropertyValues'
import { cn } from '@/lib/utils'

/**
 * Maps DMX 0-255 to brightness 0.15-1.0. The 0.15 floor keeps the swatch faintly
 * visible at zero so the colour stays recognisable when the fixture is dark.
 */
export function useDimmerBrightness(dimmerProp?: SliderPropertyDescriptor): number {
  const value = useSliderValue(
    dimmerProp ?? {
      type: 'slider',
      name: 'dummy',
      displayName: '',
      category: 'dimmer',
      channel: { universe: 0, channelNo: 0 },
      min: 0,
      max: 255,
    }
  )

  if (!dimmerProp) return 1.0
  const normalized = value / 255
  return 0.15 + normalized * 0.85
}

export function GelSwatch({
  gelHex,
  dimmerProp,
  className,
}: {
  gelHex: string
  dimmerProp?: SliderPropertyDescriptor
  className?: string
}) {
  const dimmerValue = useDimmerBrightness(dimmerProp)

  return (
    <div className={cn('rounded-sm border border-border overflow-hidden', className)}>
      <div
        className="w-full h-full"
        style={{
          backgroundColor: gelHex,
          filter: `brightness(${dimmerValue})`,
        }}
      />
    </div>
  )
}

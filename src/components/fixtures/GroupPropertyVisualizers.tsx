import { memo } from 'react'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  GroupPropertyDescriptor,
  GroupSliderPropertyDescriptor,
  GroupColourPropertyDescriptor,
  GroupPositionPropertyDescriptor,
  GroupSettingPropertyDescriptor,
} from '../../api/groupsApi'
import {
  useGroupSliderValues,
  useUpdateGroupSlider,
  useGroupColourValues,
  useUpdateGroupColour,
  useGroupPositionValues,
  useUpdateGroupPosition,
  useGroupSettingValues,
  useUpdateGroupSetting,
} from '../../hooks/useGroupPropertyValues'
import { cn } from '@/lib/utils'

interface GroupPropertyVisualizerProps {
  property: GroupPropertyDescriptor
  isEditing?: boolean
}

/**
 * Group slider property showing range for mixed values
 */
export const GroupSliderProperty = memo(function GroupSliderProperty({
  property,
  isEditing = false,
}: {
  property: GroupSliderPropertyDescriptor
  isEditing?: boolean
}) {
  const { min, max, isUniform, displayText } = useGroupSliderValues(property)
  const updateAll = useUpdateGroupSlider(property)

  const minPct = Math.round(((min - property.min) / (property.max - property.min)) * 100)
  const maxPct = Math.round(((max - property.min) / (property.max - property.min)) * 100)

  return (
    <div className="py-2">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium w-20 shrink-0">{property.displayName}</span>
        {isEditing ? (
          <>
            <Slider
              value={[max]}
              min={property.min}
              max={property.max}
              step={1}
              onValueChange={([v]) => updateAll(v)}
              className="flex-1"
            />
            <span className="w-16 text-xs text-right text-muted-foreground">
              {displayText}
            </span>
          </>
        ) : (
          <>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden relative">
              {isUniform ? (
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${minPct}%` }}
                />
              ) : (
                <div
                  className="absolute h-full bg-primary/60 transition-all"
                  style={{ left: `${minPct}%`, width: `${maxPct - minPct}%` }}
                />
              )}
            </div>
            <span className="w-16 text-xs text-right text-muted-foreground">
              {displayText}
            </span>
          </>
        )}
      </div>
    </div>
  )
})

/**
 * Group colour swatch showing combined/mixed colour
 */
export const GroupColourSwatch = memo(function GroupColourSwatch({
  property,
  isEditing = false,
}: {
  property: GroupColourPropertyDescriptor
  isEditing?: boolean
}) {
  const { isUniform, avgR, avgG, avgB, avgW, avgA, avgUv, combinedCss, displayText } =
    useGroupColourValues(property)
  const updateAll = useUpdateGroupColour(property)

  // Check if any member has extended channels
  const hasWhite = property.memberColourChannels.some((m) => m.whiteChannel)
  const hasAmber = property.memberColourChannels.some((m) => m.amberChannel)
  const hasUv = property.memberColourChannels.some((m) => m.uvChannel)
  const hasExtendedChannels = hasWhite || hasAmber || hasUv

  return (
    <div className="py-2">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium w-20 shrink-0">{property.displayName}</span>
        <div className="relative shrink-0">
          <div
            className={cn(
              'w-10 h-10 rounded border border-border shadow-inner',
              !isUniform && 'ring-2 ring-yellow-500/50',
              avgUv !== undefined && avgUv > 0 && 'ring-2 ring-purple-500/50'
            )}
            style={{ backgroundColor: combinedCss }}
            title={isUniform ? combinedCss : 'Mixed colours'}
          />
          {!isUniform && (
            <div
              className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-500 border border-background"
              title="Mixed values"
            />
          )}
          {avgUv !== undefined && avgUv > 0 && (
            <div
              className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-purple-500 border border-background"
              title={`UV: ${avgUv}`}
            />
          )}
        </div>
        {isEditing ? (
          <div className="flex-1 space-y-1">
            <ColourChannelSlider
              label="R"
              value={avgR}
              onChange={(v) => updateAll(v, avgG, avgB, avgW, avgA, avgUv)}
              colour="rgb(239, 68, 68)"
            />
            <ColourChannelSlider
              label="G"
              value={avgG}
              onChange={(v) => updateAll(avgR, v, avgB, avgW, avgA, avgUv)}
              colour="rgb(34, 197, 94)"
            />
            <ColourChannelSlider
              label="B"
              value={avgB}
              onChange={(v) => updateAll(avgR, avgG, v, avgW, avgA, avgUv)}
              colour="rgb(59, 130, 246)"
            />
            {hasWhite && (
              <ColourChannelSlider
                label="W"
                value={avgW ?? 0}
                onChange={(v) => updateAll(avgR, avgG, avgB, v, avgA, avgUv)}
                colour="rgb(156, 163, 175)"
              />
            )}
            {hasAmber && (
              <ColourChannelSlider
                label="A"
                value={avgA ?? 0}
                onChange={(v) => updateAll(avgR, avgG, avgB, avgW, v, avgUv)}
                colour="rgb(245, 158, 11)"
              />
            )}
            {hasUv && (
              <ColourChannelSlider
                label="UV"
                value={avgUv ?? 0}
                onChange={(v) => updateAll(avgR, avgG, avgB, avgW, avgA, v)}
                colour="rgb(168, 85, 247)"
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 text-xs text-muted-foreground font-mono">
            <span>{displayText}</span>
            {hasExtendedChannels && (
              <span>
                {hasWhite && <span>W:{avgW ?? 0} </span>}
                {hasAmber && <span className="text-amber-500">A:{avgA ?? 0} </span>}
                {hasUv && <span className="text-purple-400">UV:{avgUv ?? 0}</span>}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

/**
 * Individual colour channel slider
 */
function ColourChannelSlider({
  label,
  value,
  onChange,
  colour,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  colour: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-4 text-xs font-mono" style={{ color: colour }}>
        {label}
      </span>
      <Slider
        value={[value]}
        min={0}
        max={255}
        step={1}
        onValueChange={([v]) => onChange(v)}
        className="flex-1"
      />
      <span className="w-8 text-xs text-right text-muted-foreground">{value}</span>
    </div>
  )
}

/**
 * Group position indicator showing average/mixed position
 */
export const GroupPositionIndicator = memo(function GroupPositionIndicator({
  property,
  isEditing = false,
}: {
  property: GroupPositionPropertyDescriptor
  isEditing?: boolean
}) {
  const { isUniform, avgPan, avgTilt, avgPanNormalized, avgTiltNormalized, displayText } =
    useGroupPositionValues(property)
  const updateAll = useUpdateGroupPosition(property)

  // Use first member's range for editing
  const first = property.memberPositionChannels[0]
  const panRange = first ? first.panMax - first.panMin : 255
  const tiltRange = first ? first.tiltMax - first.tiltMin : 255

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditing) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    const newPan = Math.round(first.panMin + x * panRange)
    const newTilt = Math.round(first.tiltMin + y * tiltRange)
    updateAll(newPan, newTilt)
  }

  return (
    <div className="py-2">
      <div className="flex items-start gap-3">
        <span className="text-sm font-medium w-20 shrink-0">{property.displayName}</span>
        <div className="flex flex-col gap-2">
          <div
            className={cn(
              'relative w-16 h-16 bg-muted rounded border border-border',
              isEditing && 'cursor-crosshair',
              !isUniform && 'ring-2 ring-yellow-500/50'
            )}
            onClick={handleGridClick}
          >
            {/* Grid lines */}
            <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 opacity-20">
              {Array.from({ length: 16 }).map((_, i) => (
                <div key={i} className="border border-border/50" />
              ))}
            </div>
            {/* Center crosshair */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border/50" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-border/50" />
            {/* Position indicator */}
            <div
              className={cn(
                'absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/80',
                !isUniform && 'bg-yellow-500/80 border-yellow-500'
              )}
              style={{
                left: `${avgPanNormalized * 100}%`,
                top: `${avgTiltNormalized * 100}%`,
              }}
            />
          </div>
          <div className="flex flex-col text-xs text-muted-foreground font-mono">
            <span>{displayText}</span>
            {!isUniform && (
              <Badge variant="outline" className="text-xs w-fit">
                Mixed
              </Badge>
            )}
          </div>
        </div>
        {isEditing && (
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-8 text-xs">Pan</span>
              <Slider
                value={[avgPan]}
                min={first?.panMin ?? 0}
                max={first?.panMax ?? 255}
                step={1}
                onValueChange={([v]) => updateAll(v, avgTilt)}
                className="flex-1"
              />
              <span className="w-8 text-xs text-right">{avgPan}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-8 text-xs">Tilt</span>
              <Slider
                value={[avgTilt]}
                min={first?.tiltMin ?? 0}
                max={first?.tiltMax ?? 255}
                step={1}
                onValueChange={([v]) => updateAll(avgPan, v)}
                className="flex-1"
              />
              <span className="w-8 text-xs text-right">{avgTilt}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

/**
 * Group setting property with dropdown
 */
export const GroupSettingProperty = memo(function GroupSettingProperty({
  property,
  isEditing = false,
}: {
  property: GroupSettingPropertyDescriptor
  isEditing?: boolean
}) {
  const { isUniform, displayText, currentOption } = useGroupSettingValues(property)
  const updateAll = useUpdateGroupSetting(property)

  const handleChange = (value: string) => {
    const selectedOption = property.options.find((o) => o.name === value)
    if (selectedOption) {
      updateAll(selectedOption.level)
    }
  }

  return (
    <div className="py-2">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium w-20 shrink-0">{property.displayName}</span>
        {isEditing ? (
          <Select value={currentOption?.name} onValueChange={handleChange}>
            <SelectTrigger className="flex-1 h-8">
              <SelectValue placeholder={isUniform ? undefined : 'Mixed values'} />
            </SelectTrigger>
            <SelectContent>
              {property.options.map((opt) => (
                <SelectItem key={opt.name} value={opt.name}>
                  <div className="flex items-center gap-2">
                    {opt.colourPreview && (
                      <div
                        className="w-4 h-4 rounded border"
                        style={{ backgroundColor: opt.colourPreview }}
                      />
                    )}
                    <span>{opt.displayName}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center gap-2">
            {currentOption?.colourPreview && (
              <div
                className="w-5 h-5 rounded border"
                style={{ backgroundColor: currentOption.colourPreview }}
              />
            )}
            <Badge
              variant={isUniform ? 'secondary' : 'outline'}
              className={cn('font-normal', !isUniform && 'text-yellow-600 border-yellow-500')}
            >
              {displayText}
            </Badge>
          </div>
        )}
      </div>
    </div>
  )
})

/**
 * Group property visualizer router - renders appropriate component based on property type
 */
export function GroupPropertyVisualizer({
  property,
  isEditing = false,
}: GroupPropertyVisualizerProps) {
  switch (property.type) {
    case 'slider':
      return <GroupSliderProperty property={property} isEditing={isEditing} />
    case 'colour':
      return <GroupColourSwatch property={property} isEditing={isEditing} />
    case 'position':
      return <GroupPositionIndicator property={property} isEditing={isEditing} />
    case 'setting':
      return <GroupSettingProperty property={property} isEditing={isEditing} />
  }
}

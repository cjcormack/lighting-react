import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2, Copy } from 'lucide-react'
import {
  EFFECT_CATEGORY_INFO,
  getBeatDivisionLabel,
  getDistributionLabel,
  getEffectDescription,
} from '@/components/fx/fxConstants'
import { resolveFixtureTypeLabel } from '@/api/fxPresetsApi'
import type { FxPreset, FxPresetEffect, FixtureTypeHierarchy } from '@/api/fxPresetsApi'

interface PresetDetailPanelProps {
  preset: FxPreset
  hierarchy: FixtureTypeHierarchy | null
  onEdit?: () => void
  onDelete?: () => void
  onCopy?: () => void
  onEditEffect?: (index: number) => void
}

export function PresetDetailPanel({
  preset,
  hierarchy,
  onEdit,
  onDelete,
  onCopy,
  onEditEffect,
}: PresetDetailPanelProps) {
  const categories = [...new Set(preset.effects.map((e) => e.category))]
  const fixtureTypeLabel =
    preset.fixtureType && hierarchy
      ? resolveFixtureTypeLabel(preset.fixtureType, hierarchy)
      : 'All Fixtures'

  return (
    <div className="p-4 pt-6 space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold pr-8">{preset.name}</h2>
        {preset.description && (
          <p className="text-sm text-muted-foreground mt-0.5">{preset.description}</p>
        )}
        {(onEdit || onCopy || onDelete) && (
          <div className="flex items-center gap-1 mt-2">
            {onEdit && (
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onEdit}>
                <Pencil className="size-3.5" />
                Edit
              </Button>
            )}
            {onCopy && (
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onCopy}>
                <Copy className="size-3.5" />
                Copy
              </Button>
            )}
            {onDelete && (
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-destructive hover:text-destructive" onClick={onDelete}>
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">{fixtureTypeLabel}</span>
        <div className="flex items-center gap-1">
          {categories.map((cat) => {
            const info = EFFECT_CATEGORY_INFO[cat]
            if (!info) return null
            const Icon = info.icon
            return (
              <span key={cat} title={info.label}>
                <Icon className="size-3.5 text-muted-foreground" />
              </span>
            )
          })}
        </div>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {preset.effects.length} {preset.effects.length === 1 ? 'effect' : 'effects'}
        </Badge>
      </div>

      {/* Effects */}
      <div className="space-y-2">
        {preset.effects.map((effect, index) => (
          <PresetEffectDetail
            key={`${effect.effectType}-${index}`}
            effect={effect}
            onClick={onEditEffect ? () => onEditEffect(index) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

function PresetEffectDetail({ effect, onClick }: { effect: FxPresetEffect; onClick?: () => void }) {
  const categoryInfo = EFFECT_CATEGORY_INFO[effect.category]
  const CategoryIcon = categoryInfo?.icon
  const description = getEffectDescription(effect.effectType)

  const customParams = Object.entries(effect.parameters)
  const blendLabel =
    effect.blendMode !== 'OVERRIDE'
      ? effect.blendMode.charAt(0) + effect.blendMode.slice(1).toLowerCase()
      : null

  return (
    <div
      className={`border rounded-lg p-3 space-y-2 ${onClick ? 'cursor-pointer hover:bg-accent/50 transition-colors' : ''}`}
      onClick={onClick}
    >
      {/* Effect header */}
      <div className="flex items-center gap-2">
        {CategoryIcon && <CategoryIcon className="size-4 text-muted-foreground shrink-0" />}
        <span className="text-sm font-medium">{effect.effectType}</span>
        {effect.propertyName && (
          <span className="text-xs text-muted-foreground">&rarr; {effect.propertyName}</span>
        )}
      </div>

      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      {/* Parameters grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <span className="text-muted-foreground">Speed</span>
        <span>{getBeatDivisionLabel(effect.beatDivision)}</span>

        <span className="text-muted-foreground">Distribution</span>
        <span>{getDistributionLabel(effect.distribution)}</span>

        {blendLabel && (
          <>
            <span className="text-muted-foreground">Blend</span>
            <span>{blendLabel}</span>
          </>
        )}

        {effect.phaseOffset !== 0 && (
          <>
            <span className="text-muted-foreground">Phase Offset</span>
            <span>{effect.phaseOffset}</span>
          </>
        )}

        {customParams.map(([key, value]) => (
          <ParamRow key={key} name={key} value={value} />
        ))}
      </div>
    </div>
  )
}

function ParamRow({ name, value }: { name: string; value: string }) {
  const label = name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim()

  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </>
  )
}

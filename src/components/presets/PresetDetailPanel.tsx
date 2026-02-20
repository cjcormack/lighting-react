import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2, Copy } from 'lucide-react'
import { EFFECT_CATEGORY_INFO } from '@/components/fx/fxConstants'
import { EffectSummary } from '@/components/fx/EffectSummary'
import { fromPresetEffect } from '@/components/fx/effectSummaryTypes'
import { resolveFixtureTypeLabel } from '@/api/fxPresetsApi'
import type { FxPreset, FixtureTypeHierarchy } from '@/api/fxPresetsApi'
import type { EffectLibraryEntry } from '@/store/fixtureFx'

interface PresetDetailPanelProps {
  preset: FxPreset
  hierarchy: FixtureTypeHierarchy | null
  library?: EffectLibraryEntry[]
  palette?: string[]
  onEdit?: () => void
  onDelete?: () => void
  onCopy?: () => void
  onEditEffect?: (index: number) => void
}

export function PresetDetailPanel({
  preset,
  hierarchy,
  library,
  palette,
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
          <EffectSummary
            key={`${effect.effectType}-${index}`}
            effect={fromPresetEffect(effect, library)}
            palette={palette}
            onClick={onEditEffect ? () => onEditEffect(index) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

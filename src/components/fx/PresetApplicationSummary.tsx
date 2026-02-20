import { Badge } from '@/components/ui/badge'
import { Bookmark, Layers, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EFFECT_CATEGORY_INFO } from './fxConstants'
import { EffectSummary } from './EffectSummary'
import type { EffectSummaryData } from './effectSummaryTypes'

export interface PresetApplicationSummaryProps {
  presetName: string | null
  presetId: number
  effects: EffectSummaryData[]
  targets: { type: 'group' | 'fixture'; key: string }[]
  onClick?: () => void
  actions?: React.ReactNode
  palette?: string[]
  className?: string
}

export function PresetApplicationSummary({
  presetName,
  presetId,
  effects,
  targets,
  onClick,
  actions,
  palette,
  className,
}: PresetApplicationSummaryProps) {
  const categories = [...new Set(effects.map((e) => e.category))]

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden',
        onClick && 'cursor-pointer hover:bg-accent/50 transition-colors',
        className,
      )}
      onClick={onClick}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Bookmark className="size-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium truncate">
              {presetName ?? `Preset #${presetId}`}
            </span>
            {categories.map((cat) => {
              const info = EFFECT_CATEGORY_INFO[cat]
              if (!info) return null
              const CatIcon = info.icon
              return (
                <span key={cat} title={info.label}>
                  <CatIcon className="size-3 text-muted-foreground" />
                </span>
              )
            })}
            {effects.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {effects.length} fx
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {targets.map((t, ti) => (
              <span key={`t-${ti}`} className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                {t.type === 'group' ? (
                  <Layers className="size-2.5" />
                ) : (
                  <LayoutGrid className="size-2.5" />
                )}
                {t.key}
              </span>
            ))}
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
          {targets.length} target{targets.length !== 1 ? 's' : ''}
        </Badge>
        {actions && (
          <div className="flex items-center gap-0.5 shrink-0">
            {actions}
          </div>
        )}
      </div>

      {/* Nested effects */}
      {effects.length > 0 && (
        <div className="px-2 pb-2 space-y-1">
          {effects.map((fx, i) => (
            <EffectSummary
              key={`${fx.effectType}-${i}`}
              effect={fx}
              palette={palette}
              className="border-0 bg-accent/30 p-1.5"
            />
          ))}
        </div>
      )}
    </div>
  )
}

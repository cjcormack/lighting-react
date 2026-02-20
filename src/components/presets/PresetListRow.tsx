import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Pencil, Trash2, Copy, CopyPlus, ChevronDown, ChevronRight, Clapperboard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EFFECT_CATEGORY_INFO } from '@/components/fx/fxConstants'
import { EffectSummary } from '@/components/fx/EffectSummary'
import { fromPresetEffect } from '@/components/fx/effectSummaryTypes'
import type { FxPreset } from '@/api/fxPresetsApi'
import type { EffectLibraryEntry } from '@/store/fixtureFx'

interface PresetListRowProps {
  preset: FxPreset
  selected?: boolean
  expanded?: boolean
  library?: EffectLibraryEntry[]
  palette?: string[]
  onToggleExpand?: () => void
  onClick?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onCopy?: () => void
  onDuplicate?: () => void
  onEditEffect?: (index: number) => void
}

export function PresetListRow({
  preset,
  selected,
  expanded,
  library,
  palette,
  onToggleExpand,
  onClick,
  onEdit,
  onDelete,
  onCopy,
  onDuplicate,
  onEditEffect,
}: PresetListRowProps) {
  const categories = [...new Set(preset.effects.map((e) => e.category))]

  return (
    <div className={cn(selected && "bg-accent")}>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-md px-3 py-2.5 min-h-[44px] hover:bg-accent/50 transition-colors",
          onClick && "cursor-pointer",
        )}
        onClick={onClick}
      >
        {/* Expand/collapse toggle */}
        {onToggleExpand && preset.effects.length > 0 && (
          <button
            className="size-5 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand()
            }}
          >
            {expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        )}

        {/* Spacer when no expand toggle but others have it */}
        {onToggleExpand && preset.effects.length === 0 && (
          <div className="size-5 shrink-0" />
        )}

        {/* Name and description */}
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate">{preset.name}</div>
          {preset.description && (
            <div className="text-[11px] text-muted-foreground truncate mt-0.5">
              {preset.description}
            </div>
          )}
        </div>

        {/* Category icons */}
        <div className="flex items-center gap-1 shrink-0">
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

        {/* Effect count */}
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
          {preset.effects.length} fx
        </Badge>

        {/* Cue usage count */}
        {preset.cueUsageCount > 0 && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 gap-1" title={`Used in ${preset.cueUsageCount} cue${preset.cueUsageCount !== 1 ? 's' : ''}`}>
            <Clapperboard className="size-3" />
            {preset.cueUsageCount}
          </Badge>
        )}

        {/* Overflow menu */}
        {(onEdit || onDelete || onCopy || onDuplicate) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="size-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              )}
              {onDuplicate && (
                <DropdownMenuItem onClick={onDuplicate}>
                  <CopyPlus className="size-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
              )}
              {onCopy && (
                <DropdownMenuItem onClick={onCopy}>
                  <Copy className="size-4 mr-2" />
                  Copy to Project
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="size-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Expanded effects list */}
      {expanded && preset.effects.length > 0 && (
        <div className="px-3 pb-3 pt-1 space-y-2 ml-5">
          {preset.effects.map((effect, index) => (
            <EffectSummary
              key={`${effect.effectType}-${index}`}
              effect={fromPresetEffect(effect, library)}
              palette={palette}
              onClick={onEditEffect ? () => onEditEffect(index) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

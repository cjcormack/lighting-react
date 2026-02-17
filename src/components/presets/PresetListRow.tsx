import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Pencil, Trash2, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EFFECT_CATEGORY_INFO } from '@/components/fx/fxConstants'
import type { FxPreset } from '@/api/fxPresetsApi'

interface PresetListRowProps {
  preset: FxPreset
  selected?: boolean
  onClick?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onCopy?: () => void
}

export function PresetListRow({ preset, selected, onClick, onEdit, onDelete, onCopy }: PresetListRowProps) {
  const categories = [...new Set(preset.effects.map((e) => e.category))]

  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-3 py-2.5 min-h-[44px] hover:bg-accent/50 transition-colors",
        selected && "bg-accent",
        onClick && "cursor-pointer",
      )}
      onClick={onClick}
    >
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

      {/* Overflow menu */}
      {(onEdit || onDelete || onCopy) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
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
  )
}

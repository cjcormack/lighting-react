import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Pencil, Trash2, Copy } from 'lucide-react'
import { EFFECT_CATEGORY_INFO } from '@/components/fixtures/fx/fxConstants'
import type { FxPreset } from '@/api/fxPresetsApi'

interface PresetCardProps {
  preset: FxPreset
  onEdit?: () => void
  onDelete?: () => void
  onCopy?: () => void
}

export function PresetCard({ preset, onEdit, onDelete, onCopy }: PresetCardProps) {
  // Collect unique categories from effects
  const categories = [...new Set(preset.effects.map((e) => e.category))]

  return (
    <Card className="group">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-sm truncate">{preset.name}</h3>
            {preset.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {preset.description}
              </p>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
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
        </div>

        {/* Effect count and category badges */}
        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {preset.effects.length} effect{preset.effects.length !== 1 ? 's' : ''}
          </Badge>
          {categories.map((cat) => {
            const info = EFFECT_CATEGORY_INFO[cat]
            if (!info) return null
            const Icon = info.icon
            return (
              <Badge key={cat} variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                <Icon className="size-3" />
                {info.label}
              </Badge>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

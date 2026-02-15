import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Bookmark } from 'lucide-react'
import { useCurrentProjectQuery } from '@/store/projects'
import { useProjectPresetListQuery } from '@/store/fxPresets'
import type { FxPreset } from '@/api/fxPresetsApi'

interface PresetBarProps {
  hasSelection: boolean
  onApplyPreset: (preset: FxPreset) => Promise<void>
}

export function PresetBar({ hasSelection, onApplyPreset }: PresetBarProps) {
  const navigate = useNavigate()
  const { data: currentProject } = useCurrentProjectQuery()
  const { data: presets } = useProjectPresetListQuery(currentProject?.id ?? 0, {
    skip: !currentProject,
  })

  const [applyingId, setApplyingId] = useState<number | null>(null)

  const handleApply = useCallback(
    async (preset: FxPreset) => {
      if (!hasSelection || applyingId !== null) return
      setApplyingId(preset.id)
      try {
        await onApplyPreset(preset)
      } finally {
        // Brief visual feedback then clear
        setTimeout(() => setApplyingId(null), 300)
      }
    },
    [hasSelection, applyingId, onApplyPreset],
  )

  if (!presets || presets.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30">
        <Bookmark className="size-3.5 text-muted-foreground" />
        <button
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => currentProject && navigate(`/projects/${currentProject.id}/presets`)}
        >
          No presets — create one
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b overflow-x-auto scrollbar-none snap-x snap-mandatory touch-pan-x">
      <Bookmark className="size-3.5 text-muted-foreground shrink-0" />
      {presets.map((preset) => (
        <button
          key={preset.id}
          onClick={() => handleApply(preset)}
          disabled={!hasSelection || applyingId !== null}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 h-8 rounded-full border text-xs font-medium whitespace-nowrap shrink-0 snap-start',
            'transition-all select-none touch-manipulation',
            hasSelection
              ? 'hover:bg-accent/50 active:scale-95'
              : 'opacity-50 cursor-not-allowed',
            applyingId === preset.id && 'bg-primary/20 border-primary ring-1 ring-primary/50 scale-95',
          )}
        >
          <span className="truncate max-w-[120px]">{preset.name}</span>
          <Badge variant="secondary" className="text-[9px] px-1 py-0 leading-tight">
            {preset.effects.length}
          </Badge>
        </button>
      ))}
    </div>
  )
}

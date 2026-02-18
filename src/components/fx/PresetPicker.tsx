import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Bookmark, Loader2 } from 'lucide-react'
import { useCurrentProjectQuery } from '@/store/projects'
import { useProjectPresetListQuery, useTogglePresetMutation } from '@/store/fxPresets'
import type { FxPreset } from '@/api/fxPresetsApi'

interface PresetPickerProps {
  /** Target type and key for applying the preset */
  targetType: 'fixture' | 'group'
  targetKey: string
  /** Compatible preset IDs computed by the backend */
  compatiblePresetIds: number[]
}

export function PresetPicker({
  targetType,
  targetKey,
  compatiblePresetIds,
}: PresetPickerProps) {
  const { data: currentProject } = useCurrentProjectQuery()
  const { data: presets, isLoading } = useProjectPresetListQuery(currentProject?.id ?? 0, {
    skip: !currentProject,
  })
  const [togglePreset, { isLoading: isApplying }] = useTogglePresetMutation()

  const compatiblePresets = useMemo(() => {
    if (!presets || compatiblePresetIds.length === 0) return []
    const idSet = new Set(compatiblePresetIds)
    return presets.filter((preset) => idSet.has(preset.id))
  }, [presets, compatiblePresetIds])

  const handleApply = async (preset: FxPreset) => {
    if (!currentProject) return
    await togglePreset({
      projectId: currentProject.id,
      presetId: preset.id,
      targets: [{ type: targetType, key: targetKey }],
    })
  }

  if (!currentProject || isLoading || compatiblePresets.length === 0) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          title="Apply preset"
        >
          <Bookmark className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <div className="text-xs font-medium text-muted-foreground px-2 py-1.5">
          Apply Preset
        </div>
        <div className="max-h-48 overflow-y-auto">
          {compatiblePresets.map((preset) => (
            <button
              key={preset.id}
              className="flex items-center justify-between w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent transition-colors text-left"
              onClick={() => handleApply(preset)}
              disabled={isApplying}
            >
              <span className="truncate">{preset.name}</span>
              <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0 ml-2">
                {preset.effects.length} fx
              </Badge>
            </button>
          ))}
        </div>
        {isApplying && (
          <div className="flex items-center justify-center py-1">
            <Loader2 className="size-3 animate-spin" />
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

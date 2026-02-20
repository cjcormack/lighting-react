import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Play,
  Square,
  SkipBack,
  SkipForward,
  Settings,
  Loader2,
  RotateCcw,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveColourToHex } from '@/components/fx/colourUtils'
import type { CueStack } from '@/api/cueStacksApi'

interface CueStackHeaderProps {
  stack: CueStack
  isActive: boolean
  isAdvancing: boolean
  /** Effective palette for this stack from the backend (fxState.stackPalettes) */
  effectivePalette?: string[]
  onActivate: () => void
  onDeactivate: () => void
  onAdvanceForward: () => void
  onAdvanceBackward: () => void
  onEdit: () => void
}

export function CueStackHeader({
  stack,
  isActive,
  isAdvancing,
  effectivePalette,
  onActivate,
  onDeactivate,
  onAdvanceForward,
  onAdvanceBackward,
  onEdit,
}: CueStackHeaderProps) {
  const activeCue = isActive
    ? stack.cues.find((c) => c.id === stack.activeCueId)
    : null
  const activeCueIndex = isActive && stack.activeCueId != null
    ? stack.cues.findIndex((c) => c.id === stack.activeCueId)
    : -1
  const totalCues = stack.cues.length

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-2 border-b',
        isActive && 'bg-primary/5',
      )}
    >
      {/* Stack name + status */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm truncate">{stack.name}</span>
          {isActive && (
            <Badge variant="default" className="text-[10px] px-1.5 py-0">
              active
            </Badge>
          )}
          {stack.loop && (
            <RotateCcw className="size-3 text-muted-foreground shrink-0" />
          )}
        </div>
        {isActive && activeCue && (
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            Cue {activeCueIndex + 1}/{totalCues}: {activeCue.name}
          </div>
        )}
        {!isActive && totalCues > 0 && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {totalCues} cue{totalCues !== 1 ? 's' : ''}
          </div>
        )}
        {isActive && effectivePalette && effectivePalette.length > 0 && (
          <div className="flex items-center gap-0.5 mt-1">
            {effectivePalette.slice(0, 8).map((colour, i) => (
              <div
                key={i}
                className="size-3.5 rounded-sm border border-border/50"
                style={{ backgroundColor: resolveColourToHex(colour) }}
                title={`P${i + 1}`}
              />
            ))}
            {effectivePalette.length > 8 && (
              <span className="text-[10px] text-muted-foreground ml-0.5">
                +{effectivePalette.length - 8}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Transport controls */}
      <div className="flex items-center gap-1 shrink-0">
        {isActive ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onAdvanceBackward}
              disabled={isAdvancing || totalCues < 2}
              title="Previous cue"
            >
              <SkipBack className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onAdvanceForward}
              disabled={isAdvancing || totalCues < 2}
              title="Next cue"
            >
              {isAdvancing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <SkipForward className="size-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-destructive hover:text-destructive"
              onClick={onDeactivate}
              title="Stop stack"
            >
              <Square className="size-4" />
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-primary hover:text-primary"
            onClick={onActivate}
            disabled={totalCues === 0}
            title="Activate stack"
          >
            <Play className="size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onEdit}
          title="Stack settings"
        >
          <Settings className="size-4" />
        </Button>
      </div>
    </div>
  )
}

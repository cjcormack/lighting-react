import { AudioWaveform } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface EffectsOverviewToggleProps {
  isVisible: boolean
  isLocked?: boolean
  onToggle: () => void
}

export function EffectsOverviewToggle({ isVisible, isLocked, onToggle }: EffectsOverviewToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          disabled={isLocked}
          className={
            isVisible
              ? 'text-primary-foreground bg-primary-foreground/20 hover:bg-primary-foreground/30'
              : 'text-primary-foreground hover:bg-primary-foreground/10'
          }
        >
          <AudioWaveform className="size-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isLocked ? 'Effects overview (locked while in FX view)' : isVisible ? 'Hide' : 'Show'} effects overview
      </TooltipContent>
    </Tooltip>
  )
}

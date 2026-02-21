import { Grid3x3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface CueSlotOverviewToggleProps {
  isVisible: boolean
  onToggle: () => void
}

export function CueSlotOverviewToggle({ isVisible, onToggle }: CueSlotOverviewToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className={
            isVisible
              ? 'text-primary-foreground bg-primary-foreground/20 hover:bg-primary-foreground/30'
              : 'text-primary-foreground hover:bg-primary-foreground/10'
          }
        >
          <Grid3x3 className="size-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isVisible ? 'Hide' : 'Show'} FX cue slots
      </TooltipContent>
    </Tooltip>
  )
}

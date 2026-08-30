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
      {/* The locked branch is a whole sentence: the old form left ` effects overview` outside the
          ternary, so a locked toggle read "…locked while in FX view) effects overview". And it is
          the FX *page* that holds it open — "view" named a surface that no longer exists. */}
      <TooltipContent>
        {isLocked
          ? 'Effects overview (held open by the FX page)'
          : `${isVisible ? 'Hide' : 'Show'} effects overview`}
      </TooltipContent>
    </Tooltip>
  )
}

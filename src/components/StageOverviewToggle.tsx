import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface StageOverviewToggleProps {
  isVisible: boolean
  onToggle: () => void
}

function StageIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1.5" y="3" width="13" height="9" rx="1" />
      <circle cx="8" cy="7.5" r="1.4" fill="currentColor" stroke="none" />
      <path d="M5 12v1.5M11 12v1.5" />
    </svg>
  )
}

export function StageOverviewToggle({ isVisible, onToggle }: StageOverviewToggleProps) {
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
          <StageIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isVisible ? 'Hide' : 'Show'} stage
      </TooltipContent>
    </Tooltip>
  )
}

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Lock, LockOpen } from "lucide-react"
import type { Fixture } from "@/store/fixtures"
import { useFixturePark } from "@/hooks/useFixturePark"

export function FixtureParkButton({ fixture }: { fixture: Fixture }) {
  const { parkedCount, totalChannels, isPartiallyParked, isAnyParked, parkFixture, unparkFixture } =
    useFixturePark(fixture)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={isAnyParked ? "default" : "outline"}
          size="sm"
          className={isAnyParked ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}
          onClick={isAnyParked ? unparkFixture : parkFixture}
        >
          {isAnyParked ? (
            <>
              <LockOpen className="size-3.5 mr-1" />
              Unpark
            </>
          ) : (
            <>
              <Lock className="size-3.5 mr-1" />
              Park
            </>
          )}
          {isPartiallyParked && (
            <Badge variant="secondary" className="ml-1 px-1 py-0 text-[10px]">
              {parkedCount}/{totalChannels}
            </Badge>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isAnyParked
          ? `Unpark all ${parkedCount} channel(s)`
          : `Park all ${totalChannels} channels at current values`}
      </TooltipContent>
    </Tooltip>
  )
}

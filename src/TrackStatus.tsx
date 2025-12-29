import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Play, Pause } from "lucide-react"
import { useCurrentTrackQuery } from "./store/tracks"

interface TrackStatusProps {
  collapsed?: boolean
}

export default function TrackStatus({ collapsed }: TrackStatusProps) {
  const { data: currentTrack } = useCurrentTrackQuery()

  const avatar = (
    <Avatar className="size-10">
      <AvatarFallback>
        {currentTrack?.isPlaying ? (
          <Play className="size-5" />
        ) : (
          <Pause className="size-5" />
        )}
      </AvatarFallback>
    </Avatar>
  )

  if (collapsed) {
    return (
      <div className="flex justify-center py-2">
        <Tooltip>
          <TooltipTrigger asChild>{avatar}</TooltipTrigger>
          <TooltipContent side="right">
            <div className="text-sm font-medium">
              {currentTrack?.name || "No track"}
            </div>
            <div className="text-xs text-muted-foreground">
              {currentTrack?.artist || "Unknown artist"}
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {currentTrack?.name || "No track"}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {currentTrack?.artist || "Unknown artist"}
        </div>
      </div>
    </div>
  )
}

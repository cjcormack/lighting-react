import React, { useEffect, useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import { useParams, useNavigate, useSearchParams, Navigate } from "react-router-dom"
import { ChevronRight, Loader2, Lock, LockOpen } from "lucide-react"
import { useGetChannelQuery, useUpdateChannelMutation } from "../store/channels"
import { useGetChannelMappingQuery } from "../store/channelMapping"
import {
  useGetChannelParkStateQuery,
  useGetParkStateListQuery,
  useParkChannelMutation,
  useUnparkChannelMutation,
} from "../store/park"
import { useCurrentProjectQuery, useProjectQuery } from "../store/projects"
import { EditModeProvider, useEditMode } from "@/components/fixtures/EditModeContext"
import { FixtureDetailModal } from "@/components/groups/FixtureDetailModal"

export const ChannelSlider = ({
  universe,
  id,
  isEditing,
  onFixtureClick,
}: {
  universe: number
  id: number
  isEditing: boolean
  onFixtureClick?: (fixtureKey: string) => void
}) => {
  const { data: maybeValue } = useGetChannelQuery({
    universe: universe,
    channelNo: id,
  })

  const { data: mapping } = useGetChannelMappingQuery({
    universe: universe,
    channelNo: id,
  })

  const { data: parkedValue } = useGetChannelParkStateQuery({
    universe: universe,
    channelNo: id,
  })

  const isParked = parkedValue !== undefined
  const value = maybeValue || 0
  const displayValue = isParked ? parkedValue : value
  const percentage = Math.round((displayValue / 255) * 100)

  const [runUpdateChannelMutation] = useUpdateChannelMutation()
  const [runParkChannel] = useParkChannelMutation()
  const [runUnparkChannel] = useUnparkChannelMutation()

  const setValue = (value: number) => {
    runUpdateChannelMutation({
      universe: universe,
      channelNo: id,
      value: value,
    })
  }

  const handleSliderChange = (values: number[]) => {
    if (values[0] !== undefined) {
      setValue(values[0])
    }
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.value === "") {
      setValue(0)
      return
    }

    const valueNumber = Number(event.target.value)
    if (isNaN(valueNumber)) {
      return
    } else if (valueNumber < 0) {
      setValue(0)
    } else if (valueNumber > 255) {
      setValue(255)
    } else {
      setValue(valueNumber)
    }
  }

  const handleParkToggle = useCallback(() => {
    if (isParked) {
      runUnparkChannel({ universe, channelNo: id })
    } else {
      runParkChannel({ universe, channelNo: id, value })
    }
  }, [isParked, universe, id, value, runParkChannel, runUnparkChannel])

  const channelContent = (
    <div className={`rounded px-1 py-0.5 ${isParked ? "bg-amber-50/70 dark:bg-amber-900/20" : ""}`}>
      <div className="flex items-center gap-2 group/channel">
        {/* Channel number + park badge */}
        <span className="text-xs font-medium w-8 shrink-0 text-muted-foreground relative">
          {id}
          {isParked && (
            <span className="absolute -top-1 -right-1 flex size-3 items-center justify-center rounded-full bg-amber-500 text-[7px] font-bold text-white leading-none">
              P
            </span>
          )}
        </span>

        {isEditing && !isParked ? (
          <>
            <Slider
              className="flex-1 min-w-12 shrink-0"
              value={[value]}
              max={255}
              step={1}
              onValueChange={handleSliderChange}
            />
            <Input
              type="number"
              value={value}
              onChange={handleInputChange}
              min={0}
              max={255}
              className="w-12 sm:w-14 h-7 text-xs px-1 shrink-0"
            />
          </>
        ) : isEditing && isParked ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex-1 min-w-12 shrink-0 h-2 bg-muted rounded-full overflow-hidden opacity-70">
                  <div
                    className="h-full bg-amber-500 transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                Parked at {parkedValue}. Right-click to unpark.
              </TooltipContent>
            </Tooltip>
            <span className="w-8 sm:w-10 text-xs text-right text-amber-600 dark:text-amber-400 font-medium shrink-0">
              {parkedValue}
            </span>
          </>
        ) : (
          <>
            <div className="flex-1 min-w-12 shrink-0 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${isParked ? "bg-amber-500" : "bg-primary"}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className={`w-8 sm:w-10 text-xs text-right shrink-0 ${isParked ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}`}>
              {displayValue}
            </span>
          </>
        )}

        {/* Park/unpark button - visible on hover, in edit mode, or on touch devices */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleParkToggle()
              }}
              className={`shrink-0 p-0.5 rounded transition-opacity ${
                isParked
                  ? "text-amber-600 dark:text-amber-400 opacity-100"
                  : isEditing
                    ? "text-muted-foreground opacity-70 hover:opacity-100"
                    : "text-muted-foreground opacity-0 group-hover/channel:opacity-100 pointer-coarse:opacity-70"
              } hover:text-foreground`}
            >
              {isParked ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {isParked ? "Unpark channel" : "Park at current value"}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex items-center gap-1 ml-8 text-[10px] truncate">
        {mapping ? (
          <>
            <button
              className="text-muted-foreground hover:text-foreground hover:underline shrink-0"
              title={`${mapping.fixtureName}: ${mapping.description}`}
              onClick={() => onFixtureClick?.(mapping.fixtureKey)}
            >
              {mapping.fixtureName}
            </button>
            {mapping.description && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <span className="text-muted-foreground/50 truncate">{mapping.description}</span>
              </>
            )}
          </>
        ) : (
          <span className="text-muted-foreground/30">Unmapped</span>
        )}
      </div>
    </div>
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>{channelContent}</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {isParked ? (
          <ContextMenuItem onClick={() => runUnparkChannel({ universe, channelNo: id })}>
            <LockOpen className="size-4" />
            Unpark
          </ContextMenuItem>
        ) : (
          <ContextMenuItem
            onClick={() => runParkChannel({ universe, channelNo: id, value })}
          >
            <Lock className="size-4" />
            Park at current value ({value})
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

// Redirect component for /channels (no universe) - redirects to /channels/0
export function ChannelsBaseRedirect() {
  return <Navigate to="/channels/0" replace />
}

// Redirect component for /channels/:universe route
export function ChannelsRedirect() {
  const { universe } = useParams()
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/channels/${universe ?? 0}`, { replace: true })
    }
  }, [currentProject, isLoading, navigate, universe])

  if (isLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  return null
}

// Main ProjectChannels route component
export function ProjectChannels() {
  const { projectId, universe } = useParams()
  const projectIdNum = Number(projectId)
  const universeNum = Number(universe ?? 0)
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)

  // If viewing a non-current project, redirect to the current project
  if (!currentLoading && currentProject && projectIdNum !== currentProject.id) {
    return <Navigate to={`/projects/${currentProject.id}/channels/${universeNum}`} replace />
  }

  if (projectLoading || currentLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  if (!project) {
    return (
      <Card className="m-4 p-4">
        <p className="text-destructive">Project not found</p>
      </Card>
    )
  }

  return (
    <EditModeProvider>
      <ProjectChannelsContent projectName={project.name} universe={universeNum} />
    </EditModeProvider>
  )
}

function ProjectChannelsContent({ projectName, universe }: { projectName: string; universe: number }) {
  const { isEditing, toggleEditing } = useEditMode()
  const [selectedFixtureKey, setSelectedFixtureKey] = useState<string | null>(null)
  const [searchParams] = useSearchParams()
  const [showParkedOnly, setShowParkedOnly] = useState(searchParams.get("parked") === "true")

  const { data: parkStateList } = useGetParkStateListQuery()
  const [runUnparkChannel] = useUnparkChannelMutation()

  const parkedCount = parkStateList?.filter((p) => p.universe === universe).length ?? 0
  const parkedChannelSet = new Set(
    parkStateList?.filter((p) => p.universe === universe).map((p) => p.channel) ?? []
  )

  return (
    <>
      <Card className="m-4 p-4">
        <div className="flex items-start justify-between mb-4">
          <Breadcrumbs projectName={projectName} universe={universe} />
          <div className="flex items-center gap-2 shrink-0">
            {parkedCount > 0 && (
              <>
                <Button
                  variant={showParkedOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowParkedOnly(!showParkedOnly)}
                  className="gap-1.5"
                >
                  <Lock className="size-3.5" />
                  {showParkedOnly ? "Show All" : `Parked`}
                  <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px]">
                    {parkedCount}
                  </Badge>
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Unpark all ${parkedCount} channel(s) in universe ${universe}?`)) {
                          parkStateList
                            ?.filter((p) => p.universe === universe)
                            .forEach((p) => runUnparkChannel({ universe: p.universe, channelNo: p.channel }))
                        }
                      }}
                    >
                      <LockOpen className="size-3.5" />
                      Unpark All
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Unpark all channels in this universe</TooltipContent>
                </Tooltip>
              </>
            )}
            <Button
              variant={isEditing ? "default" : "outline"}
              size="sm"
              onClick={toggleEditing}
            >
              {isEditing ? "Done" : "Edit"}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <ChannelGroups
            universe={universe}
            isEditing={isEditing}
            onFixtureClick={setSelectedFixtureKey}
            filterParked={showParkedOnly ? parkedChannelSet : undefined}
          />
        </div>
      </Card>
      <FixtureDetailModal
        fixtureKey={selectedFixtureKey}
        onClose={() => setSelectedFixtureKey(null)}
        isEditing={isEditing}
      />
    </>
  )
}

// Breadcrumbs component
function Breadcrumbs({ projectName, universe }: { projectName: string; universe: number }) {
  const navigate = useNavigate()

  return (
    <nav className="flex items-center gap-1 text-sm flex-wrap">
      <button
        onClick={() => navigate("/projects")}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        Projects
      </button>
      <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />
      <button
        onClick={() => navigate("/projects")}
        className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
      >
        {projectName}
        <Badge variant="default" className="text-xs">
          active
        </Badge>
      </button>
      <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />
      <span className="font-medium">Channels (Universe {universe})</span>
    </nav>
  )
}

const ChannelGroups = ({
  universe,
  isEditing,
  onFixtureClick,
  filterParked,
}: {
  universe: number
  isEditing: boolean
  onFixtureClick?: (fixtureKey: string) => void
  filterParked?: Set<number>
}) => {
  const channelCount = 512
  const groupSize = 8

  return (
    <>
      {Array.from(Array(channelCount / groupSize)).map((_, groupNo) => {
        const channels = Array.from(Array(groupSize)).map((_, itemNo) => groupNo * groupSize + itemNo + 1)

        // If filtering to parked only, skip groups with no parked channels
        if (filterParked && !channels.some((ch) => filterParked.has(ch))) {
          return null
        }

        return (
          <Card key={groupNo} className="p-4">
            {channels.map((channelNo) => {
              // If filtering, hide non-parked channels within visible groups
              if (filterParked && !filterParked.has(channelNo)) {
                return null
              }
              return (
                <ChannelSlider
                  key={channelNo}
                  universe={universe}
                  id={channelNo}
                  isEditing={isEditing}
                  onFixtureClick={onFixtureClick}
                />
              )
            })}
          </Card>
        )
      })}
    </>
  )
}

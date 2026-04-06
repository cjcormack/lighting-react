import React, { useEffect, useState, useCallback, useMemo, useRef } from "react"
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
} from "@/components/ui/context-menu"
import { useParams, useNavigate, useSearchParams, Navigate } from "react-router-dom"
import { ChevronRight, Loader2, Lock, LockOpen } from "lucide-react"
import { useGetChannelQuery, useUpdateChannelMutation } from "../store/channels"
import { useGetChannelMappingListQuery, type ChannelMappingEntry } from "../store/channelMapping"
import {
  useGetParkStateListQuery,
  useParkChannelMutation,
  useUnparkChannelMutation,
} from "../store/park"
import { useCurrentProjectQuery, useProjectQuery } from "../store/projects"
import { EditModeProvider, useEditMode } from "@/components/fixtures/EditModeContext"
import { FixtureDetailModal } from "@/components/groups/FixtureDetailModal"
import { useVirtualizer } from "@tanstack/react-virtual"

// Pre-computed static channel groups: 64 groups of 8 channels each
const CHANNEL_GROUPS: number[][] = Array.from({ length: 64 }, (_, g) =>
  Array.from({ length: 8 }, (_, i) => g * 8 + i + 1),
)

export const ChannelSlider = React.memo(({
  universe,
  id,
  isEditing,
  mapping,
  parkedValue,
  onFixtureClick,
}: {
  universe: number
  id: number
  isEditing: boolean
  mapping?: ChannelMappingEntry
  parkedValue?: number
  onFixtureClick?: (fixtureKey: string) => void
}) => {
  const { data: maybeValue } = useGetChannelQuery({
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

  const handleSliderChange = useCallback((values: number[]) => {
    if (values[0] !== undefined) {
      runUpdateChannelMutation({ universe, channelNo: id, value: values[0] })
    }
  }, [runUpdateChannelMutation, universe, id])

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.value === "") {
      runUpdateChannelMutation({ universe, channelNo: id, value: 0 })
      return
    }
    const valueNumber = Number(event.target.value)
    if (isNaN(valueNumber)) return
    const clamped = Math.max(0, Math.min(255, valueNumber))
    runUpdateChannelMutation({ universe, channelNo: id, value: clamped })
  }, [runUpdateChannelMutation, universe, id])

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
})

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

/** Hook to track the number of grid columns via ResizeObserver */
function useGridColumns(ref: React.RefObject<HTMLDivElement | null>) {
  const [columns, setColumns] = useState(1)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      // Match Tailwind breakpoints: xl:4, lg:3, md:2, default:1
      // These are container widths, not viewport — the grid is inside a Card with padding
      if (width >= 1100) setColumns(4)
      else if (width >= 800) setColumns(3)
      else if (width >= 500) setColumns(2)
      else setColumns(1)
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return columns
}

function ProjectChannelsContent({ projectName, universe }: { projectName: string; universe: number }) {
  const { isEditing, toggleEditing } = useEditMode()
  const [selectedFixtureKey, setSelectedFixtureKey] = useState<string | null>(null)
  const [searchParams] = useSearchParams()
  const [showParkedOnly, setShowParkedOnly] = useState(searchParams.get("parked") === "true")

  // Lifted queries — single subscription for all mappings and park states
  const { data: parkStateList } = useGetParkStateListQuery()
  const { data: mappingRecord } = useGetChannelMappingListQuery()
  const [runUnparkChannel] = useUnparkChannelMutation()

  const parkedChannelSet = useMemo(
    () => new Set(parkStateList?.filter((p) => p.universe === universe).map((p) => p.channel) ?? []),
    [parkStateList, universe],
  )
  const parkedCount = parkedChannelSet.size

  // Build per-channel park value lookup for this universe
  const parkValueMap = useMemo(() => {
    const map = new Map<number, number>()
    parkStateList?.filter((p) => p.universe === universe).forEach((p) => map.set(p.channel, p.value))
    return map
  }, [parkStateList, universe])

  // Channel mappings for this universe
  const universeMappings = mappingRecord?.[universe]

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
        <ChannelGroups
          universe={universe}
          isEditing={isEditing}
          onFixtureClick={setSelectedFixtureKey}
          filterParked={showParkedOnly ? parkedChannelSet : undefined}
          universeMappings={universeMappings}
          parkValueMap={parkValueMap}
        />
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
  universeMappings,
  parkValueMap,
}: {
  universe: number
  isEditing: boolean
  onFixtureClick?: (fixtureKey: string) => void
  filterParked?: Set<number>
  universeMappings?: Record<number, ChannelMappingEntry>
  parkValueMap: Map<number, number>
}) => {
  const gridRef = useRef<HTMLDivElement>(null)
  const columns = useGridColumns(gridRef)

  // Filter groups when showing parked-only
  const visibleGroups = useMemo(() => {
    if (!filterParked) return CHANNEL_GROUPS
    return CHANNEL_GROUPS.filter((channels) => channels.some((ch) => filterParked.has(ch)))
  }, [filterParked])

  // Arrange groups into rows based on column count
  const rows = useMemo(() => {
    const result: number[][] = []
    for (let i = 0; i < visibleGroups.length; i += columns) {
      // Store the indices into visibleGroups for this row
      result.push(Array.from({ length: Math.min(columns, visibleGroups.length - i) }, (_, j) => i + j))
    }
    return result
  }, [visibleGroups, columns])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => gridRef.current,
    estimateSize: () => (isEditing ? 340 : 280),
    overscan: 3,
    measureElement: (el) => el.getBoundingClientRect().height,
  })

  // Invalidate cached measurements when edit mode changes row heights
  useEffect(() => {
    virtualizer.measure()
  }, [isEditing, virtualizer])

  return (
    <div
      ref={gridRef}
      className="overflow-y-auto"
      style={{ maxHeight: "calc(100vh - 10rem)" }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const rowGroupIndices = rows[virtualRow.index]
          return (
            <div
              key={virtualRow.index}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="grid gap-4 absolute w-full"
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                transform: `translateY(${virtualRow.start}px)`,
                paddingBottom: "1rem",
              }}
            >
              {rowGroupIndices.map((groupIdx) => {
                const channels = visibleGroups[groupIdx]
                return (
                  <Card key={groupIdx} className="p-4">
                    {channels.map((channelNo) => {
                      if (filterParked && !filterParked.has(channelNo)) return null
                      return (
                        <ChannelSlider
                          key={channelNo}
                          universe={universe}
                          id={channelNo}
                          isEditing={isEditing}
                          mapping={universeMappings?.[channelNo]}
                          parkedValue={parkValueMap.get(channelNo)}
                          onFixtureClick={onFixtureClick}
                        />
                      )
                    })}
                  </Card>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

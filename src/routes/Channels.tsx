import React, { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useParams, useNavigate, Navigate } from "react-router-dom"
import { ChevronRight, Loader2 } from "lucide-react"
import { useGetChannelQuery, useUpdateChannelMutation } from "../store/channels"
import { useGetChannelMappingQuery } from "../store/channelMapping"
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

  const value = maybeValue || 0
  const percentage = Math.round((value / 255) * 100)

  const [runUpdateChannelMutation] = useUpdateChannelMutation()

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

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium w-8 shrink-0 text-muted-foreground">
          {id}
        </span>
        {isEditing ? (
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
        ) : (
          <>
            <div className="flex-1 min-w-12 shrink-0 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="w-8 sm:w-10 text-xs text-right text-muted-foreground shrink-0">
              {value}
            </span>
          </>
        )}
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

  return (
    <>
      <Card className="m-4 p-4">
        <div className="flex items-start justify-between mb-4">
          <Breadcrumbs projectName={projectName} universe={universe} />
          <Button
            variant={isEditing ? "default" : "outline"}
            size="sm"
            onClick={toggleEditing}
            className="shrink-0"
          >
            {isEditing ? "Done" : "Edit"}
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <ChannelGroups
            universe={universe}
            isEditing={isEditing}
            onFixtureClick={setSelectedFixtureKey}
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
}: {
  universe: number
  isEditing: boolean
  onFixtureClick?: (fixtureKey: string) => void
}) => {
  const channelCount = 512
  const groupSize = 8

  return (
    <>
      {Array.from(Array(channelCount / groupSize)).map((_, groupNo) => (
        <Card key={groupNo} className="p-4">
          {Array.from(Array(groupSize)).map((_, itemNo) => {
            const channelNo = groupNo * groupSize + itemNo + 1
            return (
              <ChannelSlider
                key={itemNo}
                universe={universe}
                id={channelNo}
                isEditing={isEditing}
                onFixtureClick={onFixtureClick}
              />
            )
          })}
        </Card>
      ))}
    </>
  )
}

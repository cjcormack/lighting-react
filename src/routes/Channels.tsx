import React, { useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useParams, useNavigate, Navigate } from "react-router-dom"
import { ChevronRight, Loader2 } from "lucide-react"
import { useGetChannelQuery, useUpdateChannelMutation } from "../store/channels"
import { useCurrentProjectQuery, useProjectQuery } from "../store/projects"

export const ChannelSlider = ({
  universe,
  id,
  description,
}: {
  universe: number
  id: number
  description?: string
}) => {
  const { data: maybeValue } = useGetChannelQuery({
    universe: universe,
    channelNo: id,
  })

  const value = maybeValue || 0

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

  const handleInputBlur = () => {
    if (value < 0) {
      setValue(0)
    } else if (value > 255) {
      setValue(255)
    }
  }

  return (
    <div className="space-y-2 py-2">
      <label className="text-sm font-medium">
        {description ? `${id}: ${description}` : `Channel ${id}`}
      </label>
      <div className="flex items-center gap-4">
        <Slider
          className="flex-1"
          value={[value]}
          max={255}
          step={1}
          onValueChange={handleSliderChange}
        />
        <Input
          type="number"
          value={value}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          min={0}
          max={255}
          className="w-16"
        />
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
    <Card className="m-4 p-4">
      <div className="flex items-start justify-between mb-4">
        <Breadcrumbs projectName={project.name} universe={universeNum} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <ChannelGroups universe={universeNum} />
      </div>
    </Card>
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

const ChannelGroups = ({ universe }: { universe: number }) => {
  const channelCount = 512
  const groupSize = 8

  return (
    <>
      {Array.from(Array(channelCount / groupSize)).map((_, groupNo) => (
        <Card key={groupNo} className="p-4">
          {Array.from(Array(groupSize)).map((_, itemNo) => {
            const channelNo = groupNo * groupSize + itemNo + 1
            return (
              <ChannelSlider key={itemNo} universe={universe} id={channelNo} />
            )
          })}
        </Card>
      ))}
    </>
  )
}

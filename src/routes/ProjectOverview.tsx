import { useParams, useNavigate, Navigate } from "react-router-dom"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Braces,
  Spotlight,
  IterationCw,
  Settings,
  Loader2,
  XCircle,
  ArrowRight,
  Play,
  RotateCcw,
  Layers,
  LayoutGrid,
  SlidersHorizontal,
  AudioWaveform,
  Bookmark,
} from "lucide-react"
import { useProjectQuery, useCurrentProjectQuery } from "../store/projects"
import { useFixtureListQuery } from "../store/fixtures"
import { useProjectPresetListQuery } from "../store/fxPresets"
import { useGroupListQuery } from "../store/groups"
import { useGetUniverseQuery } from "../store/universes"
import { useState } from "react"
import { cn } from "@/lib/utils"
import EditProjectDialog from "../EditProjectDialog"

export default function ProjectOverview() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)

  const { data: project, isLoading, error } = useProjectQuery(Number(projectId), {
    skip: !projectId,
  })

  // Fetch fixtures, groups, and universes only for the current project (they're global to active project)
  const { data: fixtures } = useFixtureListQuery(undefined, {
    skip: !project?.isCurrent,
  })
  const { data: groups } = useGroupListQuery(undefined, {
    skip: !project?.isCurrent,
  })
  const { data: universes } = useGetUniverseQuery(undefined, {
    skip: !project?.isCurrent,
  })
  const { data: presets } = useProjectPresetListQuery(Number(projectId), {
    skip: !project?.isCurrent,
  })

  if (!projectId) {
    return <Navigate to="/projects" replace />
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <XCircle className="size-4" />
          <AlertDescription>Failed to load project</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <>
      <EditProjectDialog
        open={editOpen}
        setOpen={setEditOpen}
        projectId={project.id}
      />
      <div className="p-4 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{project.name}</h1>
              <Badge variant={project.isCurrent ? "default" : "outline"}>
                {project.isCurrent ? "active" : "inactive"}
              </Badge>
            </div>
            {project.description && (
              <p className="text-muted-foreground mt-1">{project.description}</p>
            )}
          </div>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Settings className="size-4" />
            Configure
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <QuickNavCard
            title="Scripts"
            count={project.scriptCount}
            icon={<Braces className="size-5" />}
            description="Kotlin lighting scripts"
            onClick={() => navigate(`/projects/${project.id}/scripts`)}
          />
          <QuickNavCard
            title="Scenes"
            count={project.sceneCount}
            icon={<Spotlight className="size-5" />}
            description="One-shot lighting configurations"
            onClick={() => navigate(`/projects/${project.id}/scenes`)}
          />
          <QuickNavCard
            title="Chases"
            count={project.chaseCount}
            icon={<IterationCw className="size-5" />}
            description="Animated lighting sequences"
            onClick={() => navigate(`/projects/${project.id}/chases`)}
          />
          {project.isCurrent && (
            <>
              <QuickNavCard
                title="Fixtures"
                count={fixtures?.length}
                icon={<LayoutGrid className="size-5" />}
                description="DMX fixture definitions"
                onClick={() => navigate(`/projects/${project.id}/fixtures`)}
              />
              <QuickNavCard
                title="Groups"
                count={groups?.length}
                icon={<Layers className="size-5" />}
                description="Fixture groups for control"
                onClick={() => navigate(`/projects/${project.id}/groups`)}
              />
              <QuickNavCard
                title="FX"
                icon={<AudioWaveform className="size-5" />}
                description="Live effects busking controls"
                onClick={() => navigate(`/projects/${project.id}/fx`)}
              />
              <QuickNavCard
                title="FX Presets"
                count={presets?.length}
                icon={<Bookmark className="size-5" />}
                description="Saved effect preset bundles"
                onClick={() => navigate(`/projects/${project.id}/presets`)}
              />
              {universes && universes.length >= 1 && (
                <QuickNavCard
                  title="Universes"
                  count={universes.length}
                  icon={<SlidersHorizontal className="size-5" />}
                  description="DMX channel control"
                  onClick={() => navigate(`/projects/${project.id}/channels/${universes[0]}`)}
                />
              )}
            </>
          )}
        </div>

        {/* Project Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Project Configuration</CardTitle>
            <CardDescription>
              Startup and automation settings for this project
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ConfigItem
              icon={<Layers className="size-4" />}
              label="Load Fixtures Script"
              value={project.loadFixturesScriptName}
              description="Script that runs at startup to define fixtures"
              onClick={project.loadFixturesScriptId ? () => navigate(`/projects/${project.id}/scripts/${project.loadFixturesScriptId}`) : undefined}
            />
            <ConfigItem
              icon={<Play className="size-4" />}
              label="Initial Scene"
              value={project.initialSceneName}
              description="Scene that runs automatically at startup"
              onClick={project.initialSceneId ? () => navigate(`/projects/${project.id}/scenes`) : undefined}
            />
            <ConfigItem
              icon={<Spotlight className="size-4" />}
              label="Track Changed Script"
              value={project.trackChangedScriptName}
              description="Script that runs when audio track changes"
              onClick={project.trackChangedScriptId ? () => navigate(`/projects/${project.id}/scripts/${project.trackChangedScriptId}`) : undefined}
            />
            <ConfigItem
              icon={<RotateCcw className="size-4" />}
              label="Run Loop Script"
              value={project.runLoopScriptName}
              description={project.runLoopDelayMs ? `Runs every ${project.runLoopDelayMs}ms` : "Continuously running automation script"}
              onClick={project.runLoopScriptId ? () => navigate(`/projects/${project.id}/scripts/${project.runLoopScriptId}`) : undefined}
            />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

// Redirect component for root path
export function ProjectOverviewRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (currentProject) {
    return <Navigate to={`/projects/${currentProject.id}`} replace />
  }

  // No current project, go to projects list
  return <Navigate to="/projects" replace />
}

function QuickNavCard({
  title,
  count,
  icon,
  description,
  onClick,
}: {
  title: string
  count?: number
  icon: React.ReactNode
  description: string
  onClick: () => void
}) {
  return (
    <Card
      className="cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            {icon}
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <Badge
            variant="secondary"
            className={cn("text-lg px-2", count === undefined && "invisible")}
          >
            {count ?? 0}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{description}</p>
          <ArrowRight className="size-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  )
}

function ConfigItem({
  icon,
  label,
  value,
  description,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string | null
  description: string
  onClick?: () => void
}) {
  const content = (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <div className="flex items-center gap-3">
        <div className="text-muted-foreground">{icon}</div>
        <div>
          <div className="font-medium">{label}</div>
          <div className="text-sm text-muted-foreground">{description}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {value ? (
          <>
            <Badge variant="outline">{value}</Badge>
            {onClick && <ArrowRight className="size-4 text-muted-foreground" />}
          </>
        ) : (
          <span className="text-sm text-muted-foreground italic">Not configured</span>
        )}
      </div>
    </div>
  )

  if (onClick && value) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left hover:bg-accent/50 rounded-md px-2 -mx-2 transition-colors"
      >
        {content}
      </button>
    )
  }

  return content
}

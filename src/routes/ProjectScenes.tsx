import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ChevronRight, Loader2, MoreVertical, PlusCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import AddSceneDialog from "../AddSceneDialog"
import SetSceneSettings from "../SetSceneSettings"
import {
  useCurrentProjectQuery,
  useProjectQuery,
  useProjectScriptQuery,
} from "../store/projects"
import {
  useProjectSceneListQuery,
  useProjectSceneQuery,
  useRunProjectSceneMutation,
  useSaveProjectSceneMutation,
  useDeleteProjectSceneMutation,
} from "../store/scenes"
import { skipToken } from "@reduxjs/toolkit/query"
import { Scene, SceneMode } from "../api/scenesApi"

// Redirect component for /scenes route
export function ScenesRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/scenes`, { replace: true })
    }
  }, [currentProject, isLoading, navigate])

  if (isLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  return null
}

// Redirect component for /chases route
export function ChasesRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/chases`, { replace: true })
    }
  }, [currentProject, isLoading, navigate])

  if (isLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  return null
}

// Main ProjectScenes route component
export function ProjectScenes({ mode }: { mode: SceneMode }) {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)

  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const isCurrentProject = project?.isCurrent === true

  const [addSceneDialogOpen, setAddSceneDialogOpen] = useState<boolean>(false)

  if (projectLoading) {
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
    <>
      {isCurrentProject && (
        <AddSceneDialog
          mode={mode}
          projectId={projectIdNum}
          open={addSceneDialogOpen}
          setOpen={setAddSceneDialogOpen}
        />
      )}
      <Card className="m-4 p-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <Breadcrumbs
            projectName={project.name}
            isCurrent={isCurrentProject}
            resourceType={mode === "SCENE" ? "Scenes" : "Chases"}
          />
          {isCurrentProject && (
            <Button onClick={() => setAddSceneDialogOpen(true)} className="self-start sm:self-auto">
              <PlusCircle className="size-4" />
              Add {mode === "SCENE" ? "Scene" : "Chase"}
            </Button>
          )}
        </div>
        <ScenesContainer
          projectId={projectIdNum}
          mode={mode}
          isCurrentProject={isCurrentProject}
        />
      </Card>
    </>
  )
}

// Breadcrumbs component
function Breadcrumbs({
  projectName,
  isCurrent,
  resourceType,
}: {
  projectName: string
  isCurrent: boolean
  resourceType: string
}) {
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
        <Badge variant={isCurrent ? "default" : "outline"} className="text-xs">
          {isCurrent ? "active" : "inactive"}
        </Badge>
      </button>
      <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />
      <span className="font-medium flex items-center gap-2">
        {resourceType}
        {!isCurrent && (
          <Badge variant="secondary" className="text-xs">
            Read-only
          </Badge>
        )}
      </span>
    </nav>
  )
}

// Scenes container - handles loading and displays grid
function ScenesContainer({
  projectId,
  mode,
  isCurrentProject,
}: {
  projectId: number
  mode: SceneMode
  isCurrentProject: boolean
}) {
  const { data: scenes, isLoading } = useProjectSceneListQuery({ projectId, mode })

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  if (!scenes || scenes.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No {mode === "SCENE" ? "scenes" : "chases"} in this project.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {scenes.map(scene => (
        <ProjectSceneCard
          key={scene.id}
          scene={scene}
          projectId={projectId}
          isCurrentProject={isCurrentProject}
        />
      ))}
    </div>
  )
}

// Scene card with permission-aware controls
const ProjectSceneCard = ({
  scene: initialScene,
  projectId,
  isCurrentProject,
}: {
  scene: Scene
  projectId: number
  isCurrentProject: boolean
}) => {
  type StatusVariant = "default" | "secondary" | "destructive" | "outline"

  interface StatusDetails {
    text: "ready" | "running..." | "active" | "failed"
    variant: StatusVariant
  }

  const navigate = useNavigate()

  // Subscribe for real-time isActive updates
  const { data: subscribedScene } = useProjectSceneQuery({ projectId, sceneId: initialScene.id })
  const scene = subscribedScene ?? initialScene

  // Get script for this scene
  const { data: script, isLoading: isScriptLoading } = useProjectScriptQuery(
    { projectId, scriptId: scene.scriptId }
  )

  const [
    runRunMutation,
    { isLoading: isRunning, isSuccess: isSuccess, isError: isError },
  ] = useRunProjectSceneMutation()

  const [runSaveMutation] = useSaveProjectSceneMutation()
  const [runDeleteMutation] = useDeleteProjectSceneMutation()

  const [showSettings, setShowSettings] = useState<boolean>(false)

  // Permission checks
  const canEdit = scene.canEdit !== false
  const canDelete = scene.canDelete !== false

  if (isScriptLoading) {
    return (
      <Card className="flex items-center justify-center p-4">
        <Loader2 className="size-4 animate-spin" />
      </Card>
    )
  }

  if (!script) {
    return (
      <Card className="p-4">
        <p className="text-sm text-destructive">Script not found</p>
      </Card>
    )
  }

  const status: StatusDetails = {
    text: "ready",
    variant: "outline",
  }

  if (isRunning) {
    status.text = "running..."
    status.variant = "secondary"
  } else if (isSuccess) {
    status.text = "active"
    status.variant = "default"
  } else if (isError) {
    status.text = "failed"
    status.variant = "destructive"
  }

  const settingsValuesObject = scene.settingsValues as object
  const settingsValuesMap: Map<string, unknown> = new Map(
    Object.entries(settingsValuesObject)
  )

  const doRun = () => {
    if (isCurrentProject) {
      runRunMutation({ projectId, sceneId: scene.id })
    }
  }

  if (status.text === "active") {
    if (!scene.isActive) {
      status.text = "ready"
      status.variant = "outline"
    }
  } else if (status.text === "ready") {
    if (scene.isActive) {
      status.text = "active"
      status.variant = "default"
    }
  }

  const handleSceneDelete = () => {
    if (confirm(`Delete "${scene.name}"?`)) {
      runDeleteMutation({ projectId, sceneId: scene.id })
    }
  }

  const handleViewScript = () => {
    navigate(`/projects/${projectId}/scripts/${scene.scriptId}`)
  }

  const saveSettingValues = (settingsValues: Map<string, unknown>) => {
    const newScene = {
      projectId,
      id: scene.id,
      name: scene.name,
      mode: scene.mode,
      scriptId: scene.scriptId,
      settingsValues: Object.fromEntries(settingsValues.entries()),
    }
    runSaveMutation(newScene)
  }

  const settingsCount = script.settings.length

  return (
    <>
      {canEdit && (
        <SetSceneSettings
          open={showSettings}
          setOpen={setShowSettings}
          settings={script.settings}
          originalSettingsValues={settingsValuesMap}
          saveSettingValues={saveSettingValues}
        />
      )}
      <Card
        className={cn(
          "flex flex-col gap-0 py-3 transition-colors",
          isCurrentProject && "cursor-pointer hover:bg-accent/50",
          scene.isActive && "bg-blue-100 dark:bg-blue-900"
        )}
        onClick={isCurrentProject ? doRun : undefined}
      >
        <CardHeader className="p-0 px-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-lg">{scene.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Run script &apos;{script.name}&apos;
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {settingsCount > 0
                  ? `${settingsCount} ${settingsCount === 1 ? "setting" : "settings"}`
                  : "\u00A0"}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="-mr-2 -mt-1">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                {canEdit && settingsCount > 0 && (
                  <DropdownMenuItem onClick={() => setShowSettings(true)}>
                    Settings
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleViewScript}>
                  View Script
                </DropdownMenuItem>
                {isCurrentProject && (
                  <>
                    <DropdownMenuSeparator />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={!canDelete}
                          onClick={canDelete ? handleSceneDelete : undefined}
                        >
                          Delete
                        </DropdownMenuItem>
                      </TooltipTrigger>
                      {!canDelete && scene.cannotDeleteReason && (
                        <TooltipContent side="left">
                          {scene.cannotDeleteReason}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardFooter className="p-0 px-3 mt-auto">
          <Badge variant={status.variant}>{status.text}</Badge>
        </CardFooter>
      </Card>
    </>
  )
}

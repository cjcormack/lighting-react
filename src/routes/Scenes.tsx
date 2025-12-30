import { useState } from "react"
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
import { MoreVertical, PlusCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import AddSceneDialog from "../AddSceneDialog"
import { useNavigate } from "react-router-dom"
import SetSceneSettings from "../SetSceneSettings"
import { useCurrentProjectQuery, useProjectScriptQuery } from "../store/projects"
import {
  useDeleteSceneMutation,
  useRunSceneMutation,
  useSaveSceneMutation,
  useSceneListQuery,
  useSceneQuery,
} from "../store/scenes"
import { skipToken } from "@reduxjs/toolkit/query"
import { Scene, SceneMode } from "../api/scenesApi"

export function Scenes({ mode }: { mode: SceneMode }) {
  const [addSceneDialogOpen, setAddSceneDialogOpen] = useState<boolean>(false)

  return (
    <>
      <AddSceneDialog
        mode={mode}
        open={addSceneDialogOpen}
        setOpen={setAddSceneDialogOpen}
      />
      <Card className="m-4 p-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">
            {mode === "SCENE" ? "Scenes" : "Chases"}
          </h1>
          <Button onClick={() => setAddSceneDialogOpen(true)}>
            <PlusCircle className="size-4" />
            Add {mode === "SCENE" ? "Scene" : "Chase"}
          </Button>
        </div>
        <ScenesContainer mode={mode} />
      </Card>
    </>
  )
}

function ScenesContainer({ mode }: { mode: SceneMode }) {
  const { data: scenes, isLoading } = useSceneListQuery(mode)

  if (isLoading) {
    return <div>Loading...</div>
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {scenes?.map(scene => (
        <SceneCard key={scene.id} scene={scene} />
      ))}
    </div>
  )
}

const SceneCard = ({ scene: initialScene }: { scene: Scene }) => {
  type StatusVariant = "default" | "secondary" | "destructive" | "outline"

  interface StatusDetails {
    text: "ready" | "running..." | "active" | "failed"
    variant: StatusVariant
  }

  // Still subscribe for real-time isActive updates
  const { data: subscribedScene } = useSceneQuery(initialScene.id)
  const scene = subscribedScene ?? initialScene

  // Get current project ID for script query
  const { data: currentProject } = useCurrentProjectQuery()
  const { data: script, isLoading: isScriptLoading } = useProjectScriptQuery(
    currentProject ? { projectId: currentProject.id, scriptId: scene.scriptId } : skipToken
  )

  const [
    runRunMutation,
    { isLoading: isRunning, isSuccess: isSuccess, isError: isError },
  ] = useRunSceneMutation()

  const [runSaveMutation] = useSaveSceneMutation()

  const [runDeleteMigration] = useDeleteSceneMutation()

  const [showSettings, setShowSettings] = useState<boolean>(false)

  const navigate = useNavigate()

  if (isScriptLoading) {
    return <div>Loading...</div>
  }
  if (!script) {
    return <div>Script not found</div>
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
    runRunMutation(scene.id)
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
    runDeleteMigration(scene.id)
  }

  const handleViewScript = () => {
    navigate(`/scripts/${scene.scriptId}`)
  }

  const saveSettingValues = (settingsValues: Map<string, unknown>) => {
    const newScene = {
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
      <SetSceneSettings
        open={showSettings}
        setOpen={setShowSettings}
        settings={script.settings}
        originalSettingsValues={settingsValuesMap}
        saveSettingValues={saveSettingValues}
      />
      <Card
        className={cn(
          "flex flex-col gap-0 py-3 cursor-pointer transition-colors hover:bg-accent/50",
          scene.isActive && "bg-blue-100 dark:bg-blue-900"
        )}
        onClick={doRun}
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
                {settingsCount > 0 && (
                  <DropdownMenuItem onClick={() => setShowSettings(true)}>
                    Settings
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleViewScript}>
                  View Script
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={handleSceneDelete}
                >
                  Delete
                </DropdownMenuItem>
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

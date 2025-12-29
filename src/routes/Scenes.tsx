import { useState } from "react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PlusCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import AddSceneDialog from "../AddSceneDialog"
import { useNavigate } from "react-router-dom"
import SetSceneSettings from "../SetSceneSettings"
import { useScriptQuery } from "../store/scripts"
import {
  useDeleteSceneMutation,
  useRunSceneMutation,
  useSaveSceneMutation,
  useSceneListQuery,
  useSceneQuery,
} from "../store/scenes"
import { skipToken } from "@reduxjs/toolkit/query"
import { SceneMode } from "../api/scenesApi"

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
  const { data: sceneIds, isLoading } = useSceneListQuery(mode)

  if (isLoading) {
    return <div>Loading...</div>
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {sceneIds?.map(sceneId => (
        <SceneCard key={sceneId} sceneId={sceneId} />
      ))}
    </div>
  )
}

const SceneCard = ({ sceneId }: { sceneId: number }) => {
  type StatusVariant = "default" | "secondary" | "destructive" | "outline"

  interface StatusDetails {
    text: "ready" | "running..." | "active" | "failed"
    variant: StatusVariant
  }

  const { data: scene, isLoading: isSceneLoading } = useSceneQuery(sceneId)

  const { data: script, isLoading: isScriptLoading } = useScriptQuery(
    scene?.scriptId ?? skipToken
  )

  const [
    runRunMutation,
    { isLoading: isRunning, isSuccess: isSuccess, isError: isError },
  ] = useRunSceneMutation()

  const [runSaveMutation] = useSaveSceneMutation()

  const [runDeleteMigration] = useDeleteSceneMutation()

  const [showSettings, setShowSettings] = useState<boolean>(false)

  const navigate = useNavigate()

  if (isSceneLoading || isScriptLoading) {
    return <div>Loading...</div>
  }
  if (!scene) {
    return <div>Scene not found</div>
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
          "cursor-pointer transition-colors hover:bg-accent/50",
          scene.isActive && "bg-blue-100 dark:bg-blue-900"
        )}
        onClick={doRun}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{scene.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Run script &apos;{script.name}&apos;
          </p>
        </CardHeader>
        <CardContent className="pb-2">
          <div className="flex flex-wrap gap-1">
            <Badge variant={status.variant}>{status.text}</Badge>
            {script.settings.map(setting => {
              const settingValue =
                settingsValuesMap.get(setting.name) ?? setting.defaultValue
              return (
                <Badge key={setting.name} variant="outline">
                  {setting.name}: {String(settingValue)}
                </Badge>
              )
            })}
          </div>
        </CardContent>
        <CardFooter
          className="flex gap-2"
          onClick={e => e.stopPropagation()}
        >
          {script.settings.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(true)}
            >
              Settings
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleViewScript}>
            Script
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={handleSceneDelete}
          >
            Delete
          </Button>
        </CardFooter>
      </Card>
    </>
  )
}

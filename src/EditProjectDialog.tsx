import { useState, useEffect, Dispatch, SetStateAction } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Loader2, Plus } from "lucide-react"
import {
  useProjectQuery,
  useUpdateProjectMutation,
  useProjectScriptsQuery,
  useProjectScenesQuery,
  useCurrentProjectQuery,
  useCreateInitialSceneMutation,
  useCreateTrackChangedScriptMutation,
  useCreateRunLoopScriptMutation,
} from "./store/projects"

interface EditProjectDialogProps {
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  projectId: number
}

export default function EditProjectDialog({
  open,
  setOpen,
  projectId,
}: EditProjectDialogProps) {
  const { data: project, isLoading: isProjectLoading } = useProjectQuery(
    projectId,
    {
      skip: !open,
    }
  )
  const { data: currentProject } = useCurrentProjectQuery()
  const { data: scripts, refetch: refetchScripts } = useProjectScriptsQuery(
    projectId,
    {
      skip: !open,
    }
  )
  const { data: scenes, refetch: refetchScenes } = useProjectScenesQuery(
    projectId,
    {
      skip: !open,
    }
  )
  const [updateProject, { isLoading: isUpdating }] = useUpdateProjectMutation()

  // Create mutations (only available for current project)
  const [createInitialScene, { isLoading: isCreatingInitialScene }] =
    useCreateInitialSceneMutation()
  const [createTrackChangedScript, { isLoading: isCreatingTrackChanged }] =
    useCreateTrackChangedScriptMutation()
  const [createRunLoopScript, { isLoading: isCreatingRunLoop }] =
    useCreateRunLoopScriptMutation()

  // Check if this is the current project
  const isCurrentProject = currentProject?.id === projectId

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [loadFixturesScriptId, setLoadFixturesScriptId] = useState<string>("")
  const [initialSceneId, setInitialSceneId] = useState<string>("none")
  const [trackChangedScriptId, setTrackChangedScriptId] = useState<string>("none")
  const [runLoopScriptId, setRunLoopScriptId] = useState<string>("none")
  const [runLoopDelayMs, setRunLoopDelayMs] = useState<string>("")

  // Populate form when project loads
  useEffect(() => {
    if (project) {
      setName(project.name)
      setDescription(project.description || "")
      setLoadFixturesScriptId(project.loadFixturesScriptId?.toString() || "")
      setInitialSceneId(project.initialSceneId?.toString() || "none")
      setTrackChangedScriptId(project.trackChangedScriptId?.toString() || "none")
      setRunLoopScriptId(project.runLoopScriptId?.toString() || "none")
      setRunLoopDelayMs(project.runLoopDelayMs?.toString() || "")
    }
  }, [project])

  const handleClose = () => {
    setOpen(false)
  }

  const handleSave = async () => {
    if (loadFixturesScriptId === "") return // Required field
    await updateProject({
      id: projectId,
      name,
      description: description || null,
      loadFixturesScriptId: Number(loadFixturesScriptId),
      initialSceneId:
        initialSceneId === "none" ? null : Number(initialSceneId),
      trackChangedScriptId:
        trackChangedScriptId === "none" ? null : Number(trackChangedScriptId),
      runLoopScriptId:
        runLoopScriptId === "none" ? null : Number(runLoopScriptId),
      runLoopDelayMs: runLoopDelayMs ? parseInt(runLoopDelayMs, 10) : null,
    }).unwrap()
    handleClose()
  }

  const handleCreateInitialScene = async () => {
    const result = await createInitialScene().unwrap()
    setInitialSceneId(result.sceneId.toString())
    refetchScripts()
    refetchScenes()
  }

  const handleCreateTrackChangedScript = async () => {
    const result = await createTrackChangedScript().unwrap()
    setTrackChangedScriptId(result.scriptId.toString())
    refetchScripts()
  }

  const handleCreateRunLoopScript = async () => {
    const result = await createRunLoopScript().unwrap()
    setRunLoopScriptId(result.scriptId.toString())
    refetchScripts()
  }

  const isValid = name.trim().length > 0 && loadFixturesScriptId !== ""
  const isCreating =
    isCreatingInitialScene || isCreatingTrackChanged || isCreatingRunLoop

  if (isProjectLoading) {
    return (
      <Dialog open={open} onOpenChange={open => !open && handleClose()}>
        <DialogContent>
          <div className="flex justify-center p-8">
            <Loader2 className="size-6 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Filter scenes to only show SCENE mode (not CHASE) for initial scene
  const sceneOnlyScenes = scenes?.filter(s => s.mode === "SCENE") || []

  return (
    <Dialog open={open} onOpenChange={open => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure Project: {project?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="font-semibold">Basic Information</h3>
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name *</Label>
              <Input
                id="project-name"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-desc">Description</Label>
              <Textarea
                id="project-desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="font-semibold">Startup Configuration</h3>
            <div className="space-y-2">
              <Label htmlFor="load-fixtures">Load Fixtures Script *</Label>
              <Select
                value={loadFixturesScriptId}
                onValueChange={setLoadFixturesScriptId}
              >
                <SelectTrigger id="load-fixtures" className="w-full">
                  <SelectValue placeholder="Select a script" />
                </SelectTrigger>
                <SelectContent>
                  {scripts?.map(script => (
                    <SelectItem key={script.id} value={String(script.id)}>
                      {script.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Script to run when project loads to configure fixtures
                (required)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="initial-scene">Initial Scene</Label>
              <div className="flex gap-2">
                <Select
                  value={initialSceneId}
                  onValueChange={setInitialSceneId}
                >
                  <SelectTrigger id="initial-scene" className="w-full">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {sceneOnlyScenes.map(scene => (
                      <SelectItem key={scene.id} value={String(scene.id)}>
                        {scene.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isCurrentProject && initialSceneId === "none" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCreateInitialScene}
                    disabled={isCreating}
                    className="shrink-0"
                  >
                    {isCreatingInitialScene ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Create
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Scene to activate when project loads
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="font-semibold">Runtime Configuration</h3>
            <div className="space-y-2">
              <Label htmlFor="track-changed">Track Changed Script</Label>
              <div className="flex gap-2">
                <Select
                  value={trackChangedScriptId}
                  onValueChange={setTrackChangedScriptId}
                >
                  <SelectTrigger id="track-changed" className="w-full">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {scripts?.map(script => (
                      <SelectItem key={script.id} value={String(script.id)}>
                        {script.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isCurrentProject && trackChangedScriptId === "none" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCreateTrackChangedScript}
                    disabled={isCreating}
                    className="shrink-0"
                  >
                    {isCreatingTrackChanged ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Create
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Script to run when music track changes
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="run-loop">Run Loop Script</Label>
              <div className="flex gap-2">
                <Select
                  value={runLoopScriptId}
                  onValueChange={setRunLoopScriptId}
                >
                  <SelectTrigger id="run-loop" className="w-full">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {scripts?.map(script => (
                      <SelectItem key={script.id} value={String(script.id)}>
                        {script.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isCurrentProject && runLoopScriptId === "none" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCreateRunLoopScript}
                    disabled={isCreating}
                    className="shrink-0"
                  >
                    {isCreatingRunLoop ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Create
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Script to run continuously in a loop
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="run-loop-delay">Run Loop Delay (ms)</Label>
              <Input
                id="run-loop-delay"
                type="number"
                value={runLoopDelayMs}
                onChange={e => setRunLoopDelayMs(e.target.value)}
                disabled={runLoopScriptId === "none"}
              />
              <p className="text-xs text-muted-foreground">
                Delay between run loop iterations
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isUpdating}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid || isUpdating}>
            {isUpdating ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

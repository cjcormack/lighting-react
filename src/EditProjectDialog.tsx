import { useState, useEffect, Dispatch, SetStateAction } from "react"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
  useCurrentProjectQuery,
  useCreateTrackChangedScriptMutation,
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
  const [updateProject, { isLoading: isUpdating }] = useUpdateProjectMutation()

  // Create mutations (only available for current project)
  const [createTrackChangedScript, { isLoading: isCreatingTrackChanged }] =
    useCreateTrackChangedScriptMutation()
  // Check if this is the current project
  const isCurrentProject = currentProject?.id === projectId

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [trackChangedScriptId, setTrackChangedScriptId] = useState<string>("none")

  // Populate form when project loads
  useEffect(() => {
    if (project) {
      setName(project.name)
      setDescription(project.description || "")
      setTrackChangedScriptId(project.trackChangedScriptId?.toString() || "none")
    }
  }, [project])

  const handleClose = () => {
    setOpen(false)
  }

  const handleSave = async () => {
    await updateProject({
      id: projectId,
      name,
      description: description || null,
      trackChangedScriptId:
        trackChangedScriptId === "none" ? null : Number(trackChangedScriptId),
    }).unwrap()
    handleClose()
  }

  const handleCreateTrackChangedScript = async () => {
    const result = await createTrackChangedScript().unwrap()
    setTrackChangedScriptId(result.scriptId.toString())
    refetchScripts()
  }

  const isValid = name.trim().length > 0
  const isCreating = isCreatingTrackChanged

  if (isProjectLoading) {
    return (
      <Sheet open={open} onOpenChange={open => !open && handleClose()}>
        <SheetContent className="flex flex-col sm:max-w-lg">
          <div className="flex justify-center p-8">
            <Loader2 className="size-6 animate-spin" />
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onOpenChange={open => !open && handleClose()}>
      <SheetContent className="flex flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Configure Project: {project?.name}</SheetTitle>
        </SheetHeader>
        <SheetBody>
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
          </div>
        </SheetBody>
        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isUpdating}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid || isUpdating}>
            {isUpdating ? "Saving..." : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

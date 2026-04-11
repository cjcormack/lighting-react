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
import { Loader2 } from "lucide-react"
import {
  useProjectQuery,
  useUpdateProjectMutation,
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
  const [updateProject, { isLoading: isUpdating }] = useUpdateProjectMutation()

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  // Populate form when project loads
  useEffect(() => {
    if (project) {
      setName(project.name)
      setDescription(project.description || "")
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
    }).unwrap()
    handleClose()
  }

  const isValid = name.trim().length > 0

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

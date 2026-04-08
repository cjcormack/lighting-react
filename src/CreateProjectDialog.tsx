import { Dispatch, SetStateAction, useState } from "react"
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
import { useCreateProjectMutation } from "./store/projects"
import type { ProjectMode } from "./api/projectApi"

interface CreateProjectDialogProps {
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
}

export default function CreateProjectDialog({
  open,
  setOpen,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [mode, setMode] = useState<ProjectMode>("SCRIPT_BASED")
  const [createProject, { isLoading }] = useCreateProjectMutation()

  const handleClose = () => {
    setName("")
    setDescription("")
    setMode("SCRIPT_BASED")
    setOpen(false)
  }

  const handleCreate = async () => {
    await createProject({
      name,
      description: description || undefined,
      mode,
    }).unwrap()
    handleClose()
  }

  const isValid = name.trim().length > 0

  return (
    <Sheet open={open} onOpenChange={open => !open && handleClose()}>
      <SheetContent className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Create New Project</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name *</Label>
            <Input
              id="project-name"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>Configuration Mode</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === "SCRIPT_BASED" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setMode("SCRIPT_BASED")}
              >
                Script-Based
              </Button>
              <Button
                type="button"
                variant={mode === "DB_BASED" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setMode("DB_BASED")}
              >
                DB-Based
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === "SCRIPT_BASED"
                ? "Configure fixtures via Kotlin DSL scripts."
                : "Configure fixtures through the Patch List UI."}
            </p>
          </div>
        </SheetBody>
        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!isValid || isLoading}>
            {isLoading ? "Creating..." : "Create"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

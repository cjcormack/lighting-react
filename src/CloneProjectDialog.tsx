import { Dispatch, SetStateAction, useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { XCircle } from "lucide-react"
import { useCloneProjectMutation } from "./store/projects"

interface CloneProjectDialogProps {
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  sourceProjectId: number
  sourceProjectName: string
}

export default function CloneProjectDialog({
  open,
  setOpen,
  sourceProjectId,
  sourceProjectName,
}: CloneProjectDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [cloneProject, { isLoading, error, reset }] = useCloneProjectMutation()

  useEffect(() => {
    if (open) {
      setName(`Copy of ${sourceProjectName}`)
      setDescription("")
      reset()
    }
  }, [open, sourceProjectName, reset])

  const handleClose = () => {
    setName("")
    setDescription("")
    setOpen(false)
  }

  const handleClone = async () => {
    try {
      await cloneProject({
        id: sourceProjectId,
        name,
        description: description || undefined,
      }).unwrap()
      handleClose()
    } catch {
      // Error handled by mutation state
    }
  }

  const isValid = name.trim().length > 0

  const errorMessage =
    error && "status" in error && error.status === 409
      ? "A project with this name already exists"
      : error
        ? "Failed to clone project"
        : undefined

  return (
    <Dialog open={open} onOpenChange={open => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Clone Project</DialogTitle>
          <DialogDescription>
            Clone &quot;{sourceProjectName}&quot; with all its scripts, scenes,
            and settings.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {errorMessage && (
            <Alert variant="destructive">
              <XCircle className="size-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="clone-name">New Project Name *</Label>
            <Input
              id="clone-name"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clone-description">Description (optional)</Label>
            <Textarea
              id="clone-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Leave empty to use the original project's description"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleClone} disabled={!isValid || isLoading}>
            {isLoading ? "Cloning..." : "Clone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { Dispatch, SetStateAction, useState, useEffect } from 'react'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { XCircle } from 'lucide-react'
import { useProjectListQuery } from '@/store/projects'
import { useCopyPresetMutation } from '@/store/fxPresets'

interface CopyPresetDialogProps {
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  sourceProjectId: number
  presetId: number
  presetName: string
}

export function CopyPresetDialog({
  open,
  setOpen,
  sourceProjectId,
  presetId,
  presetName,
}: CopyPresetDialogProps) {
  const [targetProjectId, setTargetProjectId] = useState<string>('')
  const [newName, setNewName] = useState('')
  const { data: projects } = useProjectListQuery()
  const [copyPreset, { isLoading, error, reset }] = useCopyPresetMutation()

  const targetProjects = projects?.filter((p) => p.id !== sourceProjectId) ?? []

  useEffect(() => {
    if (open) {
      setTargetProjectId('')
      setNewName('')
      reset()
    }
  }, [open, reset])

  const handleClose = () => {
    setTargetProjectId('')
    setNewName('')
    setOpen(false)
  }

  const handleCopy = async () => {
    if (targetProjectId === '') return

    try {
      await copyPreset({
        projectId: sourceProjectId,
        presetId,
        targetProjectId: Number(targetProjectId),
        newName: newName.trim() || undefined,
      }).unwrap()
      handleClose()
    } catch {
      // Error handled by mutation state
    }
  }

  const isValid = targetProjectId !== ''

  const errorMessage =
    error && 'status' in error && error.status === 409
      ? 'A preset with this name already exists in the target project'
      : error
        ? 'Failed to copy preset'
        : undefined

  return (
    <Sheet open={open} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Copy Preset to Project</SheetTitle>
          <SheetDescription>
            Copy &quot;{presetName}&quot; to another project.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {errorMessage && (
            <Alert variant="destructive">
              <XCircle className="size-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="target-project">Target Project *</Label>
            <Select value={targetProjectId} onValueChange={setTargetProjectId}>
              <SelectTrigger id="target-project" className="w-full">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {targetProjects.map((project) => (
                  <SelectItem key={project.id} value={String(project.id)}>
                    {project.name}
                    {project.isCurrent && ' (Active)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-name">New Name (optional)</Label>
            <Input
              id="new-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={presetName}
            />
            <p className="text-xs text-muted-foreground">Leave empty to keep the original name</p>
          </div>
        </SheetBody>
        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleCopy} disabled={!isValid || isLoading}>
            {isLoading ? 'Copying...' : 'Copy'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useProjectScriptsQuery } from "./store/projects"
import { useCreateProjectSceneMutation } from "./store/scenes"
import { SceneMode } from "./api/scenesApi"

interface AddSceneDetails {
  name: string
  script_id: string
}

export default function AddSceneDialog({
  mode,
  projectId,
  open,
  setOpen,
}: {
  mode: SceneMode
  projectId: number
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
}) {
  const { data: scriptList, isLoading: scriptsLoading } = useProjectScriptsQuery(projectId)
  const isLoading = scriptsLoading

  const [runCreateMutation] = useCreateProjectSceneMutation()

  const [value, setValue] = useState<AddSceneDetails>({
    name: "",
    script_id: "",
  })

  const isValid = value.name && value.script_id && Number(value.script_id)

  const clearValue = () => {
    setValue({
      name: "",
      script_id: "",
    })
  }

  const handleClose = () => {
    clearValue()
    setOpen(false)
  }

  const handleAdd = () => {
    runCreateMutation({
      projectId,
      mode: mode,
      name: value.name,
      scriptId: Number(value.script_id),
      settingsValues: new Map(),
    }).then(() => {
      setOpen(false)
    })
  }

  if (isLoading) {
    return <>Loading...</>
  }

  return (
    <Sheet open={open} onOpenChange={open => !open && handleClose()}>
      <SheetContent className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            Create {mode === "SCENE" ? "Scene" : "Chase"}
          </SheetTitle>
        </SheetHeader>
        <SheetBody>
          <div className="space-y-2">
            <Label htmlFor="scene-name">Name *</Label>
            <Input
              id="scene-name"
              value={value.name}
              onChange={e =>
                setValue({ name: e.target.value, script_id: value.script_id })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scene-script">Script *</Label>
            <Select
              value={value.script_id}
              onValueChange={script_id =>
                setValue({ name: value.name, script_id })
              }
            >
              <SelectTrigger id="scene-script" className="w-full">
                <SelectValue placeholder="Select a script" />
              </SelectTrigger>
              <SelectContent>
                {(scriptList ?? []).map(script => (
                  <SelectItem key={script.id} value={String(script.id)}>
                    {script.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SheetBody>
        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!isValid}>
            Init
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

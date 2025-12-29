import { ChangeEvent, Dispatch, SetStateAction, useState } from "react"
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
import { ScriptSetting } from "./store/scripts"

export default function SetSceneSettings({
  open,
  setOpen,
  settings,
  originalSettingsValues,
  saveSettingValues,
}: {
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  settings: ScriptSetting[]
  originalSettingsValues: ReadonlyMap<string, unknown>
  saveSettingValues: (settingsValues: Map<string, unknown>) => void
}) {
  const [updatedSettingsValues, setUpdatedSettingsValues] = useState<
    Map<string, unknown>
  >(new Map(originalSettingsValues))

  const clearValue = () => {
    setUpdatedSettingsValues(new Map(originalSettingsValues))
  }

  const handleClose = () => {
    clearValue()
    setOpen(false)
  }

  const handleSave = () => {
    saveSettingValues(updatedSettingsValues)
    clearValue()
    setOpen(false)
  }

  const handleValueChange = (setting: ScriptSetting) => {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const newSettingsValues = new Map(updatedSettingsValues)
      const valueNumber = Number(e.target.value)
      newSettingsValues.set(setting.name, valueNumber)
      setUpdatedSettingsValues(newSettingsValues)
    }
  }

  return (
    <Dialog open={open} onOpenChange={open => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Scene Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {settings.map(setting => (
            <div key={setting.name} className="space-y-2">
              <Label htmlFor={`scene-setting-${setting.name}`}>
                {setting.name}
              </Label>
              <Input
                id={`scene-setting-${setting.name}`}
                value={
                  (updatedSettingsValues.get(setting.name) ??
                    originalSettingsValues.get(setting.name) ??
                    setting.defaultValue) as string | number
                }
                onChange={handleValueChange(setting)}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

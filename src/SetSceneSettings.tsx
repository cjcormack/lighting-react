import { ChangeEvent, Dispatch, SetStateAction, useState } from "react"
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
    <Sheet open={open} onOpenChange={open => !open && handleClose()}>
      <SheetContent className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Set Scene Settings</SheetTitle>
        </SheetHeader>
        <SheetBody>
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
        </SheetBody>
        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

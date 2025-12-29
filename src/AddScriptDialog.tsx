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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScriptSetting } from "./store/scripts"

export default function AddScriptDialog({
  open,
  setOpen,
  addSetting,
}: {
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  addSetting: (setting: ScriptSetting) => void
}) {
  const [value, setValue] = useState<ScriptSetting>({
    name: "",
    type: "scriptSettingInt",
    minValue: undefined,
    maxValue: undefined,
    defaultValue: undefined,
  })

  const isValid = value.name

  const clearValue = () => {
    setValue({
      name: "",
      type: "scriptSettingInt",
      minValue: undefined,
      maxValue: undefined,
      defaultValue: undefined,
    })
  }

  const handleClose = () => {
    clearValue()
    setOpen(false)
  }

  const handleAdd = () => {
    addSetting(value)
    clearValue()
    setOpen(false)
  }

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValue({
      ...value,
      name: e.target.value,
    })
  }

  const handleMinValueChange = (e: ChangeEvent<HTMLInputElement>) => {
    const valueNumber = Number(e.target.value)
    if (isNaN(valueNumber) || e.target.value === "") {
      setValue({ ...value, minValue: undefined })
      return
    }
    setValue({ ...value, minValue: valueNumber })
  }

  const handleMaxValueChange = (e: ChangeEvent<HTMLInputElement>) => {
    const valueNumber = Number(e.target.value)
    if (isNaN(valueNumber) || e.target.value === "") {
      setValue({ ...value, maxValue: undefined })
      return
    }
    setValue({ ...value, maxValue: valueNumber })
  }

  const handleDefaultValueChange = (e: ChangeEvent<HTMLInputElement>) => {
    const valueNumber = Number(e.target.value)
    if (isNaN(valueNumber) || e.target.value === "") {
      setValue({ ...value, defaultValue: undefined })
      return
    }
    setValue({ ...value, defaultValue: valueNumber })
  }

  return (
    <Dialog open={open} onOpenChange={open => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Setting</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="setting-name">Name *</Label>
            <Input
              id="setting-name"
              value={value.name}
              onChange={handleNameChange}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setting-type">Type *</Label>
            <Select value="scriptSettingInt" disabled>
              <SelectTrigger id="setting-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scriptSettingInt">Int</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="setting-min">Min Value</Label>
            <Input
              id="setting-min"
              value={value.minValue ?? ""}
              onChange={handleMinValueChange}
              placeholder="not set"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setting-max">Max Value</Label>
            <Input
              id="setting-max"
              value={value.maxValue ?? ""}
              onChange={handleMaxValueChange}
              placeholder="not set"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setting-default">Default Value</Label>
            <Input
              id="setting-default"
              value={value.defaultValue ?? ""}
              onChange={handleDefaultValueChange}
              placeholder="not set"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!isValid}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

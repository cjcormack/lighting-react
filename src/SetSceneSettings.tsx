import React, {ChangeEvent, Dispatch, SetStateAction, useState} from "react";
import {Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField} from "@mui/material";
import { ScriptSetting } from "./store/scripts"

export default function SetSceneSettings({open, setOpen, settings, originalSettingsValues, saveSettingValues}: {
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
  settings: ScriptSetting[],
  originalSettingsValues: ReadonlyMap<string, unknown>,
  saveSettingValues: (settingsValues: Map<string, unknown>) => void,
}) {
  const [updatedSettingsValues, setUpdatedSettingsValues] = useState<Map<string, unknown>>(new Map())

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
      <Dialog
          open={open}
          onClose={handleClose}
          maxWidth="sm"
          fullWidth
      >
        <DialogTitle>
          Set Scene Settings
        </DialogTitle>
        <DialogContent>
          <Stack>
            {
              settings.map((setting) => (
                  <TextField
                      id={`scene-setting-${setting.name}`}
                      key={setting.name}
                      label={setting.name}
                      autoFocus
                      fullWidth
                      required
                      variant="standard"
                      value={updatedSettingsValues.get(setting.name) ?? originalSettingsValues.get(setting.name) ?? setting.defaultValue}
                      onChange={handleValueChange(setting)}
                  />

              ))
            }
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} autoFocus>Cancel</Button>
          <Button onClick={handleSave} autoFocus>Save</Button>
        </DialogActions>
      </Dialog>
  )
}

import React, {ChangeEvent, Dispatch, SetStateAction, useState} from "react";
import {Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField} from "@mui/material";
import {ScriptSetting} from "./api/scriptsApi";

export default function AddScriptDialog({open, setOpen, addSetting}: {
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
  addSetting: (setting: ScriptSetting) => void,
}) {
  const [value, setValue] = useState<ScriptSetting>({
    name: '',
    type: 'scriptSettingInt',
    minValue: null,
    maxValue: null,
    defaultValue: null,
  })

  const isValid = value.name

  const clearValue = () => {
    setValue({
      name: '',
      type: 'scriptSettingInt',
      minValue: null,
      maxValue: null,
      defaultValue: null,
    })
  }

  const handleClose = () => {
    clearValue()
    setOpen(false)
  }

  const handleAdd = () => {
    addSetting(value)
    console.log('Add', value)
    clearValue()
    setOpen(false)
  }

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValue({
      name: e.target.value,
      type: value.type,
      minValue: value.minValue,
      maxValue: value.maxValue,
      defaultValue: value.defaultValue,
    })
  }

  const handleMinValueChange = (e: ChangeEvent<HTMLInputElement>) => {
    const valueNumber = Number(e.target.value)
    if (isNaN(valueNumber) || e.target.value === '') {
      const newValue = {
        name: value.name,
        type: value.type,
        minValue: null,
        maxValue: value.maxValue,
        defaultValue: value.defaultValue,
      }

      setValue(newValue)
      return
    }

    const newValue = {
      name: value.name,
      type: value.type,
      minValue: valueNumber,
      maxValue: value.maxValue,
      defaultValue: value.defaultValue,
    }

    setValue(newValue)
  }

  const handleMaxValueChange = (e: ChangeEvent<HTMLInputElement>) => {
    const valueNumber = Number(e.target.value)
    if (isNaN(valueNumber) || e.target.value === '') {
      const newValue = {
        name: value.name,
        type: value.type,
        minValue: value.minValue,
        maxValue: null,
        defaultValue: value.defaultValue,
      }

      setValue(newValue)
      return
    }

    const newValue = {
      name: value.name,
      type: value.type,
      minValue: value.minValue,
      maxValue: valueNumber,
      defaultValue: value.defaultValue,
    }

    setValue(newValue)
  }

  const handleDefaultValueChange = (e: ChangeEvent<HTMLInputElement>) => {
    const valueNumber = Number(e.target.value)
    if (isNaN(valueNumber) || e.target.value === '') {
      const newValue = {
        name: value.name,
        type: value.type,
        minValue: value.minValue,
        maxValue: value.maxValue,
        defaultValue: null,
      }

      setValue(newValue)
      return
    }

    const newValue = {
      name: value.name,
      type: value.type,
      minValue: value.minValue,
      maxValue: value.maxValue,
      defaultValue: valueNumber,
    }

    setValue(newValue)
  }

  return (
      <Dialog
          open={open}
          onClose={handleClose}
          maxWidth="sm"
          fullWidth
      >
        <DialogTitle>
          Add Setting
        </DialogTitle>
        <DialogContent>
          <Stack>
            <TextField
                id="name"
                label="Name"
                autoFocus
                fullWidth
                required
                variant="standard"
                value={value.name}
                onChange={handleNameChange}
            />
            <TextField
                id="type"
                select
                label="Type"
                fullWidth
                required
                variant="standard"
                value="scriptSettingInt"
            >
              <MenuItem value="scriptSettingInt">
                Int
              </MenuItem>
            </TextField>
            <TextField
                id="minValue"
                label="Min Value"
                fullWidth
                variant="standard"
                value={value.minValue ?? ""}
                onChange={handleMinValueChange}
                placeholder="not set"
            />
            <TextField
                id="maxValue"
                label="Max Value"
                fullWidth
                variant="standard"
                value={value.maxValue ?? ""}
                onChange={handleMaxValueChange}
                placeholder="not set"
            />
            <TextField
                id="defaultValue"
                label="Default Value"
                fullWidth
                variant="standard"
                value={value.defaultValue ?? ""}
                onChange={handleDefaultValueChange}
                placeholder="not set"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} autoFocus>Cancel</Button>
          <Button onClick={handleAdd} disabled={!isValid}>Add</Button>
        </DialogActions>
      </Dialog>
  )
}

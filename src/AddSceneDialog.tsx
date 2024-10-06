import React, {ChangeEvent, Dispatch, SetStateAction, useState} from "react";
import {useRecoilValue} from "recoil";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import {lightingApi} from "./api/lightingApi";
import { useScriptListQuery } from "./store/scripts"

interface AddSceneDetails {
  name: string,
  script_id: string,
}

export default function AddSceneDialog({open, setOpen, setSceneSaving}: {
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
  setSceneSaving: Dispatch<SetStateAction<boolean>>,
}) {
  const {
    data: scriptList,
    isLoading,
    isFetching,
  } = useScriptListQuery()

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
    lightingApi.scenes.create({
      name: value.name,
      scriptId: Number(value.script_id),
      settingsValues: new Map(),
    }).then(() => {
      setSceneSaving(false)
    })

    setSceneSaving(true)
    clearValue()
    setOpen(false)
  }

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValue({
      name: e.target.value,
      script_id: value.script_id,
    })
  }

  const handleScriptChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = {
      name: value.name,
      script_id: e.target.value,
    }

    setValue(newValue)
  }

  if (isLoading || isFetching) {
    return (
      <>Loading...</>
    )
  }

  return (
      <Dialog
          open={open}
          onClose={handleClose}
          maxWidth="sm"
          fullWidth
      >
        <DialogTitle>
          Create Scene
        </DialogTitle>
        <DialogContent>
          <Stack>
            <TextField
                id="name"
                label="Name"
                fullWidth
                required
                variant="standard"
                value={value.name}
                onChange={handleNameChange}
            />
            <TextField
                id="script"
                select
                autoFocus
                label="Script"
                fullWidth
                required
                variant="standard"
                value={value.script_id}
                onChange={handleScriptChange}
            >
              {(scriptList ?? []).map((script) => (
                  <MenuItem key={script.id} value={script.id}>
                    {script.name}
                  </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} autoFocus>Cancel</Button>
          <Button onClick={handleAdd} disabled={!isValid}>Init</Button>
        </DialogActions>
      </Dialog>
  )
}

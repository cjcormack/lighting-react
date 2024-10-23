import {
  Box,
  Button,
  ButtonGroup,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid, IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material"
import React, { Dispatch, SetStateAction, Suspense, useEffect, useState } from "react"
import {
  unstable_usePrompt,
  useLocation,
  useNavigate,
  useParams
} from "react-router-dom"
import {
  Add as AddIcon,
  Build as BuildIcon,
  PlayArrow as PlayArrowIcon,
  RemoveCircle as RemoveCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon
} from "@mui/icons-material"

import AddScriptDialog from "../AddScriptDialog"
import {
  CompileResult, RunResult,
  ScriptDetails,
  ScriptSetting,
  useCompileScriptMutation, useCreateScriptMutation, useDeleteScriptMutation, useRunScriptMutation, useSaveScriptMutation,
  useScriptListQuery,
  useScriptQuery
} from "../store/scripts"
// @ts-ignore
import ReactKotlinPlayground from "../kotlinScript/index.mjs"

export default function Scripts() {
  const { scriptId } = useParams()

  return (
    <Paper
      sx={{
        p: 2,
        m: 2,
        display: "flex",
        flexDirection: "column"
      }}>
      <Box>
        <Typography variant="h2">
          Scripts
        </Typography>
        <Grid container spacing={0}>
          <Grid item xs="auto">
            <Box sx={{ width: 200, bgcolor: "background.paper" }}>
              <List dense={true}>
                <Suspense fallback={"Loading..."}>
                  <ScriptList />
                </Suspense>
              </List>
            </Box>
          </Grid>
          <Grid item xs>
            {scriptId === undefined ? (
              <></>
            ) : scriptId === "new" ? (
              <NewScript />
            ) : (
              <Suspense fallback={"Loading..."}>
                <EditScript id={Number(scriptId)} />
              </Suspense>
            )
            }
          </Grid>
        </Grid>
      </Box>
    </Paper>
  )
}

const ScriptList = () => {
  const {
    data: scriptList,
    isLoading,
    isFetching
  } = useScriptListQuery()

  const navigate = useNavigate()

  const doNew = () => {
    navigate("/scripts/new")
  }

  if (isLoading || isFetching) {
    return (
      <>Loading...</>
    )
  }

  const scriptIds = (scriptList ?? []).map((it) => it.id)

  return (
    <>
      {scriptIds.map((scriptId) => {
        return (
          <ScriptListEntry key={scriptId} id={scriptId} />
        )
      })}
      <Box sx={{ m: 1 }}>
        <Button startIcon={<AddIcon />}
                size="small"
                variant="outlined"
                fullWidth
                onClick={doNew}>New Script</Button>
      </Box>
    </>
  )
}

const ScriptListEntry = ({ id }: { id: number }) => {
  const {
    data: script,
    isLoading,
    isFetching
  } = useScriptQuery(id)

  const navigate = useNavigate()
  const location = useLocation()

  if (isLoading || isFetching) {
    return (
      <>Loading...</>
    )
  }

  if (!script) {
    return (
      <>Not found</>
    )
  }

  return (
    <ListItemButton
      onClick={() => navigate(`/scripts/${id}`)}
      selected={location.pathname === `/scripts/${id}`}>
      <ListItemText
        primary={script.name}
      />
    </ListItemButton>
  )
}

interface ScriptEdits {
  id?: number,
  name?: string,
  script?: string,
  settings?: ScriptSetting[],
}

const NewScript = () => {
  const script: ScriptDetails = {
    name: "",
    script: "",
    settings: []
  }
  return (
    <ScriptDisplay script={script} />
  )
}

const EditScript = ({ id }: { id: number }) => {
  const {
    data: script,
    isLoading,
    isFetching
  } = useScriptQuery(id)

  if (isLoading || isFetching) {
    return (
      <>Loading...</>
    )
  }

  if (!script) {
    return (
      <>Not found</>
    )
  }

  return (
    <ScriptDisplay script={script} id={id} />
  )
}

const ScriptDisplay = ({ script, id }: { script: ScriptDetails, id?: number }) => {
  const [
    runCompileMutation,
    {
      data: compileResult,
      isUninitialized: hasNotCompiled,
      isLoading: isCompiling,
      reset: resetCompile,
    }
  ] = useCompileScriptMutation()
  const [
    runRunMutation,
    {
      data: runResult,
      isUninitialized: hasNotRun,
      isLoading: isRunning,
      reset: resetRun,
    }
  ] = useRunScriptMutation()

  const [runSaveMutation] = useSaveScriptMutation()
  const [runCreateMutation] = useCreateScriptMutation()

  const [deleteAlertOpen, setDeleteAlertOpen] = useState<boolean>(false)

  const [newId, setNewId] = useState<number | undefined>()
  const [edits, setEdits] = useState<ScriptEdits>({})

  const navigate = useNavigate()

  const hasChanged = edits.name !== undefined || edits.script !== undefined || edits.settings !== undefined

  unstable_usePrompt({ when: hasChanged && newId === undefined, message: "Unsaved changes" })

  useEffect(() => {
    if (newId !== undefined) {
      navigate(`/scripts/${newId}`)
    }
    if (edits.id !== id) {
      setEdits({
        id: id
      })
    }
  })

  if (script === undefined) {
    return null
  }

  const scriptName = edits.name !== undefined ? edits.name : script.name

  const settings = edits.settings !== undefined ? edits.settings : script.settings

  const scriptPrefix = `import uk.me.cormack.lighting7.fixture.*
import uk.me.cormack.lighting7.fixture.dmx.*
import uk.me.cormack.lighting7.fixture.hue.*
import java.awt.Color
import uk.me.cormack.lighting7.dmx.*
import uk.me.cormack.lighting7.show.*
import uk.me.cormack.lighting7.scripts.*
import uk.me.cormack.lighting7.scriptSettings.*

class TestScript(
    fixtures: Fixtures.FixturesWithTransaction, 
    scriptName: 
    String, 
    step: Int, 
    sceneName: String, 
    sceneIsActive: Boolean,
    settings: Map<String, String>
): LightingScript(fixtures, scriptName, step, sceneName, sceneIsActive, settings) {}

fun TestScript.test() {
//sampleStart
`
  const scriptSuffix = `
//sampleEnd
}
`

  const scriptScript = edits.script !== undefined ? edits.script : script.script

  const isNew = id === undefined

  const canReset = hasChanged && !isNew
  const canSave = hasChanged && scriptName !== "" && scriptScript !== ""
  const canDelete = !isNew
  const canCompile = scriptScript !== ""
  const canRun = scriptScript !== ""

  const doCompile = () => {
    runCompileMutation({
      script: scriptScript,
      settings: settings
    })
  }
  const doRun = () => {
    runRunMutation({
      script: scriptScript,
      settings: settings
    })
  }
  const doDelete = () => {
    if (!isNew) {
      setDeleteAlertOpen(true)
    }
  }
  const doReset = () => {
    if (!isNew) {
      setEdits({
        id: id
      })
    }
  }
  const doSave = () => {
    if (isNew) {
      runCreateMutation({
        name: scriptName,
        script: scriptScript,
        settings: settings
      }).then((newScript) => {
        console.log(newScript.data)

        if (!newScript.data) {
          throw new Error('data unexpectedly empty')
        }

        setEdits({
          id: newScript.data.id
        })
        setNewId(newScript.data.id)
      })
    } else {
      runSaveMutation({
        id: id,
        name: scriptName,
        script: scriptScript,
        settings: settings
      }).then(() => {
        setEdits({
          id: id
        })
      })
    }
  }

  const onNameChange = (ev: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const updatedEdits: ScriptEdits = {
      id: id,
      script: edits.script,
      settings: edits.settings
    }

    if (ev.target.value !== script.name) {
      updatedEdits.name = ev.target.value
    }
    setEdits(updatedEdits)
  }
  const onScriptChange = (value: string) => {
    const updatedEdits: ScriptEdits = {
      id: id,
      name: edits.name,
      settings: edits.settings
    }

    if (value !== script.script) {
      updatedEdits.script = value
    }
    setEdits(updatedEdits)
  }

  const addSetting = (setting: ScriptSetting) => {
    const updatedEdits: ScriptEdits = {
      id: id,
      name: edits.name,
      script: edits.script
    }

    const updatedSettings: ScriptSetting[] = settings.filter((existingSetting) => {
      return existingSetting.name !== setting.name
    })
    updatedSettings.push(setting)

    if (updatedEdits.settings !== updatedSettings) {
      updatedEdits.settings = updatedSettings
    }

    setEdits(updatedEdits)
  }

  const removeSetting = (setting: ScriptSetting) => {
    const updatedEdits: ScriptEdits = {
      id: id,
      name: edits.name,
      script: edits.script
    }

    const updatedSettings: ScriptSetting[] = settings.filter((existingSetting) => {
      return existingSetting.name !== setting.name
    })

    if (updatedEdits.settings !== updatedSettings) {
      updatedEdits.settings = updatedSettings
    }

    setEdits(updatedEdits)
  }

  return (
    <>
      <ScriptCompileDialog
        compileResult={compileResult}
        hasNotCompiled={hasNotCompiled}
        isCompiling={isCompiling}
        resetCompile={resetCompile}
      />
      <ScriptRunDialog
        runResult={runResult}
        hasNotRun={hasNotRun}
        isRunning={isRunning}
        resetRun={resetRun}
      />
      {
        isNew ? null : <DeleteConfirmAlert id={id} open={deleteAlertOpen} setOpen={setDeleteAlertOpen} />
      }
      <Paper
        sx={{
          p: 2,
          m: 2,
          display: "flex",
          flexDirection: "column"
        }}>
        <Box>
          <TextField
            required
            id="outlined-required"
            label="Name"
            fullWidth={true}
            value={scriptName}
            onChange={onNameChange}
          />
        </Box>
      </Paper>
      <ScriptSettings settings={settings} addSetting={addSetting} removeSetting={removeSetting} />
      <Paper
        sx={{
          p: 2,
          m: 2,
          display: "flex",
          flexDirection: "column"
        }}>
        <ReactKotlinPlayground
          mode="kotlin"
          lines="true"
          onChange={onScriptChange}
          value={scriptPrefix + scriptScript + scriptSuffix}
          highlightOnFly="true"
          autocomplete="true"
          matchBrackets="true"
          key={id ? `${id}` : "new"}
        />
      </Paper>
      <Paper
        sx={{
          p: 2,
          m: 2,
          display: "flex",
          flexDirection: "column"
        }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between"
          }}
        >
          <ButtonGroup aria-label="outlined button group">
            <Button startIcon={<BuildIcon />} disabled={!canCompile} onClick={doCompile}>Compile</Button>
            <Button startIcon={<PlayArrowIcon />} disabled={!canRun} onClick={doRun}>Run</Button>
          </ButtonGroup>
          <ButtonGroup variant="contained" aria-label="text button group">
            <Button color="error" disabled={!canDelete} onClick={doDelete}>Delete</Button>
            <Button disabled={!canReset} onClick={doReset}>Reset</Button>
            <Button disabled={!canSave} onClick={doSave}>
              {isNew ? "Create" : "Save"}
            </Button>
          </ButtonGroup>
        </Box>
      </Paper>
    </>
  )
}

const ScriptCompileDialog = ({ compileResult, hasNotCompiled, isCompiling, resetCompile }: {
  compileResult?: CompileResult,
  hasNotCompiled: boolean,
  isCompiling: boolean,
  resetCompile: () => void,
}) => {
  const open = !hasNotCompiled

  let title: string
  let color: string
  if (isCompiling) {
    title = "Compiling..."
    color = ""
  } else if (compileResult?.success) {
    title = "Compilation Successful"
    color = "green"
  } else {
    title = "Compilation Failed"
    color = "error"
  }

  return (
    <Dialog
      open={open}
      aria-labelledby="compile-result-dialog-title"
      aria-describedby="compile-result-dialog-description"
    >
      <DialogTitle
        id="compile-result-dialog-title"
        color={color}>
        {title}
      </DialogTitle>
      <DialogContent dividers={true}>
        <DialogContent
          id="compile-result-dialog-description"
          tabIndex={-1}
        >
          <List>
            {
              compileResult?.messages.map((message, index) => {
                return (
                  <ListItem key={index}>
                    <ListItemIcon>
                      {
                        message.severity === "ERROR"
                          ? <ErrorIcon color="error" fontSize="large" />
                          : message.severity === "WARNING"
                            ? <WarningIcon color="warning" fontSize="large" />
                            : <InfoIcon fontSize="large" />
                      }
                    </ListItemIcon>
                    <ListItemText primary={message.message}
                                  secondary={message.sourcePath ? `${message.sourcePath} ${message.location}` : ""} />
                  </ListItem>
                )
              })
            }

          </List>
        </DialogContent>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => {
          resetCompile()
        }}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

const ScriptRunDialog = ({ runResult, hasNotRun, isRunning, resetRun }: {
  runResult?: RunResult,
  hasNotRun: boolean,
  isRunning: boolean,
  resetRun: () => void,
}) => {
  const open = !hasNotRun

  let title: string
  let color: string
  if (isRunning) {
    title = "Running..."
    color = ""
  } else if (runResult?.status === "success") {
    title = "Run Successful"
    color = "green"
  } else {
    title = "Run Failed"
    color = "error"
  }

  return (
    <Dialog
      open={open}
      aria-labelledby="run-result-dialog-title"
      aria-describedby="run-result-dialog-description"
    >
      <DialogTitle
        id="run-result-dialog-title"
        color={color}>
        {title}
      </DialogTitle>
      <DialogContent dividers={true}>
        <DialogContent
          id="run-result-dialog-description"
          tabIndex={-1}
        >
          <List>
            {
              runResult?.result != null ?
                <ListItem style={{ whiteSpace: "pre-wrap" }}>
                  {runResult.result}
                </ListItem>
                : runResult?.messages != null ?
                  runResult.messages.map((message, index) => {
                    return (
                      <ListItem key={index}>
                        <ListItemIcon>
                          {
                            message.severity === "ERROR"
                              ? <ErrorIcon color="error" fontSize="large" />
                              : message.severity === "WARNING"
                                ? <WarningIcon color="warning" fontSize="large" />
                                : <InfoIcon fontSize="large" />
                          }
                        </ListItemIcon>
                        <ListItemText primary={message.message}
                                      secondary={message.sourcePath ? `${message.sourcePath} ${message.location}` : ""} />
                      </ListItem>
                    )
                  })
                  : null
            }

          </List>
        </DialogContent>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => {
          resetRun()
        }}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

const DeleteConfirmAlert = ({ id, open, setOpen }: {
  id: number,
  open: (boolean),
  setOpen: Dispatch<SetStateAction<boolean>>
}) => {
  const navigate = useNavigate()

  const [runDeleteMigration] = useDeleteScriptMutation()

  const handleDelete = () => {
    runDeleteMigration(id).then(() => {
      navigate("/scripts")
      setOpen(false)
    })
  }

  const handleClose = () => {
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="delete-alert-dialog-title"
      aria-describedby="delete-alert-dialog-description"
    >
      <DialogTitle id="delete-alert-dialog-title">
        {"Really delete this script?"}
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="delete-alert-dialog-description">
          Are you sure you want to delete this script?
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} autoFocus>Cancel</Button>
        <Button onClick={handleDelete}>Delete</Button>
      </DialogActions>
    </Dialog>
  )
}

function ScriptSettings({ settings, addSetting, removeSetting }: {
  settings: readonly ScriptSetting[],
  addSetting: (setting: ScriptSetting) => void,
  removeSetting: (setting: ScriptSetting) => void,
}) {
  const [addScriptDialogOpen, setAddScriptDialogOpen] = useState<boolean>(false)

  return (
    <>
      <Suspense fallback={"Loading..."}>
        <AddScriptDialog open={addScriptDialogOpen} setOpen={setAddScriptDialogOpen} addSetting={addSetting} />
      </Suspense>
      <Paper
        sx={{
          p: 2,
          m: 2,
          display: "flex",
          flexDirection: "column"
        }}>
        <Box>
          <Typography variant="h5">
            Settings
          </Typography>
          <TableContainer component={Paper}>
            <Table aria-label="simple table">
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell colSpan={2}>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {
                  settings.length ?
                    (
                      settings.map((setting) => (
                        <TableRow
                          key={setting.name}
                          sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                        >
                          <TableCell component="th" scope="row">
                            {setting.type}
                          </TableCell>
                          <TableCell>{setting.name}</TableCell>
                          <TableCell>min: {setting.minValue};
                            max: {setting.maxValue};
                            default: {setting.defaultValue}</TableCell>
                          <TableCell align="right">
                            <IconButton aria-label="delete" size="medium" onClick={() => removeSetting(setting)}>
                              <RemoveCircleIcon />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )
                    :
                    <TableRow>
                      <TableCell colSpan={4}>
                        No settings
                      </TableCell>
                    </TableRow>
                }

              </TableBody>
            </Table>
          </TableContainer>
          <Box
            display="flex"
            sx={{
              justifyContent: "space-between"
            }}
          >
            <Box sx={{
              paddingTop: "10px",
              marginLeft: "auto"
            }}>
              <Button variant="outlined" startIcon={<AddIcon />} size="small"
                      onClick={() => setAddScriptDialogOpen(true)}>
                Add Setting
              </Button>
            </Box>
          </Box>

        </Box>
      </Paper>
    </>
  )
}

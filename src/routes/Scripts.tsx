import {
  Box, Button, ButtonGroup, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Grid,
  List, ListItem, ListItemButton, ListItemIcon,
  ListItemText, Paper, TextField
} from "@mui/material";
import React, {Dispatch, SetStateAction, Suspense, useEffect, useState} from "react";
import {atom, selector, selectorFamily, useRecoilRefresher_UNSTABLE, useRecoilState, useRecoilValue} from "recoil";
import {lightingApi} from "../api/lightingApi";
import {CompileResult, RunResult, Script} from "../api/scriptsApi";
import {
  unstable_usePrompt,
  useLocation,
  useNavigate,
  useParams
} from "react-router-dom";
import AceEditor from "react-ace";

import "ace-builds/src-noconflict/mode-kotlin"
import "ace-builds/src-noconflict/theme-github";
import "ace-builds/src-noconflict/ext-language_tools";
import {Build as BuildIcon, PlayArrow as PlayArrowIcon, Warning as WarningIcon, Error as ErrorIcon, Info as InfoIcon} from "@mui/icons-material";

const scriptListState = selector<readonly Script[]>({
  key: 'scriptList',
  get: () => {
    return lightingApi.scripts.getAll()
  },
})

const scriptIdsState = selector<Array<number>>({
  key: 'scriptIds',
  get: ({get}) => {
    const scripts = get(scriptListState)
    return scripts.map((it) => it.id)
  },
})

const scriptsMappedByIdState = selector<Map<number, Script>>({
  key: 'scriptsMappedById',
  get: ({get}) => {
    const scriptList = get(scriptListState)
    return new Map(scriptList.map((script => [script.id, script])))
  }
})

const scriptState = selectorFamily<Script, number>({
  key: 'script',
  get: (scriptId: number) => ({get}) => {
    const scriptsMappedById = get(scriptsMappedByIdState)
    const script = scriptsMappedById.get(scriptId)
    if (script === undefined) {
      throw new Error("Script not found")
    }
    return script
  },
})

export default function Scripts() {
  const {scriptId} = useParams()
  return (
      <Grid container spacing={0}>
        <Grid item xs="auto">
          <Box sx={{width: 200, bgcolor: 'background.paper'}}>
            <List dense={true}>
              <Suspense fallback={'Loading...'}>
                <ScriptList/>
              </Suspense>
              <ListItemButton>
                <ListItemText
                    primary="Single-line item"
                />
              </ListItemButton>
              <ListItemButton>
                <ListItemText
                    primary="Single-line item"
                />
              </ListItemButton>
              <ListItemButton>
                <ListItemText
                    primary="Single-line item"
                />
              </ListItemButton>
            </List>
          </Box>
        </Grid>
        <Grid item xs>
          {scriptId === undefined ? (
              <></>
          ) : (
              <Suspense fallback={'Loading...'}>
                <ScriptDisplay id={Number(scriptId)}/>
              </Suspense>
          )
          }
        </Grid>
      </Grid>
  )
}

const ScriptList = () => {
  const scriptIds = useRecoilValue(scriptIdsState)

  return (
      <>
        {scriptIds.map((scriptId) => {
          return (
              <Suspense key={scriptId} fallback={'Loading...'}>
                <ScriptListEntry id={scriptId}/>
              </Suspense>
          )
        })}
      </>
  )
}

const scriptEditsState = atom<ScriptEdits>({
  key: 'script-edits',
  default: {},
})

const ScriptListEntry = ({id}: { id: number }) => {
  const script = useRecoilValue(scriptState(id))

  const navigate = useNavigate()
  const location = useLocation()

  return (
      <ListItemButton
          onClick={() => navigate(`/lighting/scripts/${id}`)}
          selected={location.pathname === `/lighting/scripts/${id}`}>
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
}

const ScriptDisplay = ({id}: { id: number }) => {
  const script = useRecoilValue(scriptState(id))

  const [compileResult, setCompileResult] = useState<Promise<CompileResult> | undefined>()
  const [runResult, setRunResult] = useState<Promise<RunResult> | undefined>()

  const [edits, setEdits] = useRecoilState(scriptEditsState)
  const [deleteAlertOpen, setDeleteAlertOpen] = useState<boolean>(false)

  const scriptListRefresher = useRecoilRefresher_UNSTABLE(scriptListState)

  const hasChanged = edits.name !== undefined || edits.script !== undefined

  unstable_usePrompt({when: hasChanged, message: "Unsaved changes"})

  useEffect(() => {
    if (edits.id !== id) {
      setEdits({
        id: id,
      })
    }
  })

  if (script === undefined) {
    return null
  }

  const scriptName = edits.name !== undefined ? edits.name : script.name
  const scriptScript = edits.script !== undefined ? edits.script : script.script

  const canReset = hasChanged
  const canSave = hasChanged
  const canDelete = true
  const canCompile = scriptScript !== ''
  const canRun = scriptScript !== ''

  const doCompile = () => {
    setCompileResult(lightingApi.scripts.compile(scriptScript))
  }
  const doRun = () => {
    setRunResult(lightingApi.scripts.run(scriptScript))
  }
  const doDelete = () => {
    setDeleteAlertOpen(true)
  }
  const doReset = () => {
    setEdits({
      id: script.id,
    })
  }
  const doSave = () => {
    lightingApi.scripts.save(id, {
      name: scriptName,
      script: scriptScript,
    }).then(() => {
      scriptListRefresher()
      setEdits({
        id: script.id,
      })
    })
  }

  const onNameChange = (ev: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const updatedEdits: ScriptEdits = {
      id: script.id,
      script: edits.script,
    }

    if (ev.target.value !== script.name) {
      updatedEdits.name = ev.target.value
    }
    setEdits(updatedEdits)
  }
  const onScriptChange = (value: string) => {
    const updatedEdits: ScriptEdits = {
      id: script.id,
      name: edits.name,
    }

    if (value !== script.script) {
      updatedEdits.script = value
    }
    setEdits(updatedEdits)
  }

  return (
      <>
        <ScriptCompileDialog compileResult={compileResult} setCompileResult={setCompileResult}/>
        <ScriptRunDialog runResult={runResult} setRunResult={setRunResult}/>
        <DeleteConfirmAlert id={id} open={deleteAlertOpen} setOpen={setDeleteAlertOpen} />
        <Paper
            sx={{
              p: 2,
              m: 2,
              display: 'flex',
              flexDirection: 'column',
            }}>
          <Box>
            <div>
              <TextField
                  required
                  id="outlined-required"
                  label="Name"
                  fullWidth={true}
                  value={scriptName}
                  onChange={onNameChange}
              />
            </div>
          </Box>
        </Paper>
        <Paper
            sx={{
              p: 2,
              m: 2,
              display: 'flex',
              flexDirection: 'column',
            }}>
          <AceEditor
              mode="kotlin"
              theme="github"
              editorProps={{$blockScrolling: true}}
              value={scriptScript}
              onChange={onScriptChange}
              width="100%"
              height="400px"
          />
        </Paper>
        <Paper
            sx={{
              p: 2,
              m: 2,
              display: 'flex',
              flexDirection: 'column',
            }}>
          <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
              }}
          >
            <ButtonGroup aria-label="outlined button group">
              <Button startIcon={<BuildIcon />} disabled={!canCompile} onClick={doCompile}>Compile</Button>
              <Button startIcon={<PlayArrowIcon />} disabled={!canRun} onClick={doRun}>Run</Button>
            </ButtonGroup>
            <ButtonGroup variant="contained" aria-label="text button group">
              <Button color="error" disabled={!canDelete} onClick={doDelete}>Delete</Button>
              <Button disabled={!canReset} onClick={doReset}>Reset</Button>
              <Button disabled={!canSave} onClick={doSave}>Save</Button>
            </ButtonGroup>
          </Box>
        </Paper>
      </>
  )
}

const ScriptCompileDialog = ({compileResult, setCompileResult}: {compileResult: Promise<CompileResult> | undefined, setCompileResult: Dispatch<SetStateAction<Promise<CompileResult> | undefined>>}) => {
  const open = compileResult !== undefined

  const [resolvedCompileResult, setResolvedCompileResult] = useState<CompileResult | undefined>()

  useEffect(() => {
    if (compileResult !== undefined) {
      compileResult.then((res) => {
        setResolvedCompileResult((res))
      })
    }
  }, [compileResult])

  if (compileResult === undefined) {
    return null
  }

  let title: string
  let color: string
  if (resolvedCompileResult === undefined) {
    title ='Compiling...'
    color = ""
  } else if (resolvedCompileResult.success) {
    title='Compilation Successful'
    color = "green"
  } else {
    title='Compilation Failed'
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
                resolvedCompileResult?.report.messages.map((message, index) => {
                  return (
                      <ListItem key={index}>
                        <ListItemIcon>
                          {
                            message.severity.name === 'ERROR'
                              ? <ErrorIcon color="error" fontSize="large" />
                              : message.severity.name === 'WARNING'
                              ? <WarningIcon color="warning" fontSize="large" />
                              : <InfoIcon fontSize="large" />
                          }
                        </ListItemIcon>
                        <ListItemText primary={message.message} secondary={message.sourcePath ?`${message.sourcePath} ${message.location}` : '' } />
                      </ListItem>
                  )
                })
              }

            </List>
          </DialogContent>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setCompileResult(undefined)
            setResolvedCompileResult(undefined)
          }}>Close</Button>
        </DialogActions>
      </Dialog>
  )
}

const ScriptRunDialog = ({runResult, setRunResult}: {runResult: Promise<RunResult> | undefined, setRunResult: Dispatch<SetStateAction<Promise<RunResult> | undefined>>}) => {
  const open = runResult !== undefined

  const [resolvedRunResult, setResolvedRunResult] = useState<RunResult | undefined>()

  useEffect(() => {
    if (runResult !== undefined) {
      runResult.then((res) => {
        setResolvedRunResult((res))
      })
    }
  }, [runResult])

  if (runResult === undefined) {
    return null
  }

  let title: string
  let color: string
  if (resolvedRunResult === undefined) {
    title ='Running...'
    color = ""
  } else if (resolvedRunResult.status === 'success') {
    title='Run Successful'
    color = "green"
  } else {
    title='Run Failed'
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
                resolvedRunResult?.error != null ?
                    resolvedRunResult?.error.messages.map((message, index) => {
                      return (
                          <ListItem key={index}>
                            <ListItemIcon>
                              {
                                message.severity.name === 'ERROR'
                                  ? <ErrorIcon color="error" fontSize="large" />
                                  : message.severity.name === 'WARNING'
                                  ? <WarningIcon color="warning" fontSize="large" />
                                  : <InfoIcon fontSize="large" />
                              }
                            </ListItemIcon>
                            <ListItemText primary={message.message} secondary={message.sourcePath ?`${message.sourcePath} ${message.location}` : '' } />
                          </ListItem>
                      )
                    })
                : resolvedRunResult?.result != null ?
                    JSON.stringify(resolvedRunResult.result)
                : null
              }

            </List>
          </DialogContent>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setRunResult(undefined)
            setResolvedRunResult(undefined)
          }}>Close</Button>
        </DialogActions>
      </Dialog>
  )
}

const DeleteConfirmAlert = ({id, open, setOpen}: {id: number, open: (boolean), setOpen: Dispatch<SetStateAction<boolean>>}) => {
  const scriptListRefresher = useRecoilRefresher_UNSTABLE(scriptListState)
  const navigate = useNavigate()

  const handleDelete = () => {
    lightingApi.scripts.delete(id).then(() => {
      scriptListRefresher()
      navigate('/lighting/scripts')
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

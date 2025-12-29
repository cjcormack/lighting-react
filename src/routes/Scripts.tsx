import React, { Dispatch, SetStateAction, Suspense, useEffect, useState } from "react"
import {
  unstable_usePrompt,
  useLocation,
  useNavigate,
  useParams
} from "react-router-dom"
import { Plus, Wrench, Play, MinusCircle, AlertTriangle, XCircle, Info } from "lucide-react"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { useIsDarkMode } from "@/hooks/useIsDarkMode"

import AddScriptDialog from "../AddScriptDialog"
import {
  CompileResult, RunResult,
  ScriptDetails,
  ScriptSetting,
  useCompileScriptMutation, useCreateScriptMutation, useDeleteScriptMutation, useRunScriptMutation, useSaveScriptMutation,
  useScriptListQuery,
  useScriptQuery
} from "../store/scripts"
// @ts-expect-error - no type declarations for kotlinScript
import ReactKotlinPlayground from "../kotlinScript/index.mjs"

export default function Scripts() {
  const { scriptId } = useParams()

  return (
    <Card className="m-4 p-4 flex flex-col">
      <h1 className="text-3xl font-bold mb-4">Scripts</h1>
      <div className="flex gap-0">
        <div className="w-52">
          <Suspense fallback={<div>Loading...</div>}>
            <ScriptList />
          </Suspense>
        </div>
        <div className="flex-1">
          {scriptId === undefined ? (
            <></>
          ) : scriptId === "new" ? (
            <NewScript />
          ) : (
            <Suspense fallback={<div>Loading...</div>}>
              <EditScript id={Number(scriptId)} />
            </Suspense>
          )}
        </div>
      </div>
    </Card>
  )
}

const ScriptList = () => {
  const {
    data: scriptList,
    isLoading,
  } = useScriptListQuery()

  const navigate = useNavigate()

  const doNew = () => {
    navigate("/scripts/new")
  }

  if (isLoading) {
    return <div>Loading...</div>
  }

  const scriptIds = (scriptList ?? []).map((it) => it.id)

  return (
    <div className="flex flex-col">
      {scriptIds.map((scriptId) => {
        return (
          <ScriptListEntry key={scriptId} id={scriptId} />
        )
      })}
      <div className="m-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={doNew}
        >
          <Plus className="size-4" />
          New Script
        </Button>
      </div>
    </div>
  )
}

const ScriptListEntry = ({ id }: { id: number }) => {
  const {
    data: script,
    isLoading,
  } = useScriptQuery(id)

  const navigate = useNavigate()
  const location = useLocation()

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (!script) {
    return <div>Not found</div>
  }

  const isSelected = location.pathname === `/scripts/${id}`

  return (
    <button
      className={cn(
        "w-full text-left px-4 py-2 text-sm hover:bg-accent transition-colors",
        isSelected && "bg-accent"
      )}
      onClick={() => navigate(`/scripts/${id}`)}
    >
      {script.name}
    </button>
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
    isFetching,
  } = useScriptQuery(id)

  if (isLoading || isFetching) {
    return <div>Loading...</div>
  }

  if (!script) {
    return <div>Not found</div>
  }

  return (
    <ScriptDisplay script={script} id={id} />
  )
}

const ScriptDisplay = ({ script, id }: { script: ScriptDetails, id?: number }) => {
  const isDarkMode = useIsDarkMode()

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

  const onNameChange = (ev: React.ChangeEvent<HTMLInputElement>) => {
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
      <Card className="p-4 m-2 flex flex-col">
        <div className="space-y-2">
          <Label htmlFor="script-name">Name</Label>
          <Input
            id="script-name"
            required
            value={scriptName}
            onChange={onNameChange}
          />
        </div>
      </Card>
      <ScriptSettings settings={settings} addSetting={addSetting} removeSetting={removeSetting} />
      <Card className="p-4 m-2 flex flex-col">
        <ReactKotlinPlayground
          mode="kotlin"
          lines="true"
          onChange={onScriptChange}
          value={scriptPrefix + scriptScript + scriptSuffix}
          highlightOnFly="true"
          autocomplete="true"
          matchBrackets="true"
          theme={isDarkMode ? "darcula" : "idea"}
          key={`${id ?? "new"}-${isDarkMode ? "dark" : "light"}`}
        />
      </Card>
      <Card className="p-4 m-2 flex flex-col">
        <div className="flex justify-between">
          <div className="flex gap-1">
            <Button variant="outline" disabled={!canCompile} onClick={doCompile}>
              <Wrench className="size-4" />
              Compile
            </Button>
            <Button variant="outline" disabled={!canRun} onClick={doRun}>
              <Play className="size-4" />
              Run
            </Button>
          </div>
          <div className="flex gap-1">
            <Button variant="destructive" disabled={!canDelete} onClick={doDelete}>
              Delete
            </Button>
            <Button variant="secondary" disabled={!canReset} onClick={doReset}>
              Reset
            </Button>
            <Button disabled={!canSave} onClick={doSave}>
              {isNew ? "Create" : "Save"}
            </Button>
          </div>
        </div>
      </Card>
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
  let titleClass: string
  if (isCompiling) {
    title = "Compiling..."
    titleClass = ""
  } else if (compileResult?.success) {
    title = "Compilation Successful"
    titleClass = "text-green-600"
  } else {
    title = "Compilation Failed"
    titleClass = "text-destructive"
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && resetCompile()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className={titleClass}>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {compileResult?.messages.map((message, index) => (
            <div key={index} className="flex items-start gap-3 p-2">
              {message.severity === "ERROR" ? (
                <XCircle className="size-6 text-destructive flex-shrink-0" />
              ) : message.severity === "WARNING" ? (
                <AlertTriangle className="size-6 text-yellow-500 flex-shrink-0" />
              ) : (
                <Info className="size-6 flex-shrink-0" />
              )}
              <div>
                <p className="font-medium">{message.message}</p>
                {message.sourcePath && (
                  <p className="text-sm text-muted-foreground">
                    {message.sourcePath} {message.location}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={resetCompile}>Close</Button>
        </DialogFooter>
      </DialogContent>
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
  let titleClass: string
  if (isRunning) {
    title = "Running..."
    titleClass = ""
  } else if (runResult?.status === "success") {
    title = "Run Successful"
    titleClass = "text-green-600"
  } else {
    title = "Run Failed"
    titleClass = "text-destructive"
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && resetRun()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className={titleClass}>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {runResult?.result != null ? (
            <pre className="whitespace-pre-wrap p-2">{runResult.result}</pre>
          ) : runResult?.messages != null ? (
            runResult.messages.map((message, index) => (
              <div key={index} className="flex items-start gap-3 p-2">
                {message.severity === "ERROR" ? (
                  <XCircle className="size-6 text-destructive flex-shrink-0" />
                ) : message.severity === "WARNING" ? (
                  <AlertTriangle className="size-6 text-yellow-500 flex-shrink-0" />
                ) : (
                  <Info className="size-6 flex-shrink-0" />
                )}
                <div>
                  <p className="font-medium">{message.message}</p>
                  {message.sourcePath && (
                    <p className="text-sm text-muted-foreground">
                      {message.sourcePath} {message.location}
                    </p>
                  )}
                </div>
              </div>
            ))
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={resetRun}>Close</Button>
        </DialogFooter>
      </DialogContent>
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
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Really delete this script?</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this script?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
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
      <Suspense fallback={<div>Loading...</div>}>
        <AddScriptDialog open={addScriptDialogOpen} setOpen={setAddScriptDialogOpen} addSetting={addSetting} />
      </Suspense>
      <Card className="p-4 m-2 flex flex-col">
        <h2 className="text-xl font-semibold mb-4">Settings</h2>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead colSpan={2}>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.length ? (
                settings.map((setting) => (
                  <TableRow key={setting.name}>
                    <TableCell className="font-medium">{setting.type}</TableCell>
                    <TableCell>{setting.name}</TableCell>
                    <TableCell>
                      min: {setting.minValue}; max: {setting.maxValue}; default: {setting.defaultValue}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSetting(setting)}
                      >
                        <MinusCircle className="size-5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No settings
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex justify-end pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddScriptDialogOpen(true)}
          >
            <Plus className="size-4" />
            Add Setting
          </Button>
        </div>
      </Card>
    </>
  )
}

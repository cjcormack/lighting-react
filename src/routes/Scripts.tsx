import React, { Dispatch, SetStateAction, Suspense, useEffect, useState } from "react"
import {
  useLocation,
  useNavigate,
  useParams
} from "react-router-dom"
import { Plus, Wrench, Play, AlertTriangle, XCircle, Info, Menu, IterationCw, Braces, LayoutGrid, Repeat, Spotlight } from "lucide-react"

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
import { cn, arraysEqual } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useIsDarkMode } from "@/hooks/useIsDarkMode"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges"
import { UnsavedChangesDialog } from "../UnsavedChangesDialog"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ScriptSettingsTable } from "@/components/scripts/ScriptSettingsTable"
import {
  CompileResult, RunResult,
  Script,
  ScriptDetails,
  ScriptInput,
  ScriptSetting,
  useCompileScriptMutation, useCreateScriptMutation, useDeleteScriptMutation, useRunScriptMutation, useSaveScriptMutation,
  useScriptListQuery,
  useScriptQuery
} from "../store/scripts"
// @ts-expect-error - no type declarations for kotlinScript
import ReactKotlinPlayground from "../kotlinScript/index.mjs"

export default function Scripts() {
  const { scriptId } = useParams()
  const navigate = useNavigate()
  const isMobile = useMediaQuery("(max-width: 767px)")
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { data: scriptList } = useScriptListQuery()

  // Auto-select first script if none selected
  useEffect(() => {
    if (scriptId === undefined && scriptList && scriptList.length > 0) {
      navigate(`/scripts/${scriptList[0].id}`, { replace: true })
    }
  }, [scriptId, scriptList, navigate])

  return (
    <Card className="m-4 p-4 flex flex-col min-w-0">
      <div className="flex items-center gap-2 mb-4">
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
        )}
        <h1 className="text-3xl font-bold">Scripts</h1>
      </div>
      <div className="flex gap-0 min-w-0">
        {isMobile ? (
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="p-4 border-b">
                <SheetTitle>Scripts</SheetTitle>
              </SheetHeader>
              <div className="overflow-y-auto flex-1">
                <Suspense fallback={<div className="p-4">Loading...</div>}>
                  <ScriptList onSelect={() => setDrawerOpen(false)} />
                </Suspense>
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <div className="w-52">
            <Suspense fallback={<div>Loading...</div>}>
              <ScriptList />
            </Suspense>
          </div>
        )}
        <div className="flex-1 min-w-0">
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

interface ScriptListProps {
  onSelect?: () => void
}

const ScriptList = ({ onSelect }: ScriptListProps) => {
  const {
    data: scriptList,
    isLoading,
  } = useScriptListQuery()

  const navigate = useNavigate()

  const doNew = () => {
    navigate("/scripts/new")
    onSelect?.()
  }

  if (isLoading) {
    return <div>Loading...</div>
  }

  const scriptIds = (scriptList ?? []).map((it) => it.id)

  return (
    <div className="flex flex-col">
      {scriptIds.map((scriptId) => {
        return (
          <ScriptListEntry key={scriptId} id={scriptId} onSelect={onSelect} />
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

// Determine the most prominent usage of a script for display
type ScriptUsage = {
  icon: React.ReactNode
  tooltip: string
}

const getScriptUsage = (script: Script): ScriptUsage => {
  // Priority: Project properties > Scenes > Chases > Unmapped
  if (script.usedByProperties.length > 0) {
    // Show the most important property with its specific icon
    if (script.usedByProperties.includes('loadFixturesScript')) {
      return { icon: <LayoutGrid className="size-4" />, tooltip: 'Load Fixtures Script' }
    }
    if (script.usedByProperties.includes('trackChangedScript')) {
      return { icon: <Play className="size-4" />, tooltip: 'Track Changed Script' }
    }
    if (script.usedByProperties.includes('runLoopScript')) {
      return { icon: <Repeat className="size-4" />, tooltip: 'Run Loop Script' }
    }
  }

  if (script.sceneNames.length > 0) {
    const count = script.sceneNames.length
    return {
      icon: <Spotlight className="size-4" />,
      tooltip: count === 1 ? `Used by scene: ${script.sceneNames[0]}` : `Used by ${count} scenes`
    }
  }

  if (script.chaseNames.length > 0) {
    const count = script.chaseNames.length
    return {
      icon: <IterationCw className="size-4" />,
      tooltip: count === 1 ? `Used by chase: ${script.chaseNames[0]}` : `Used by ${count} chases`
    }
  }

  return { icon: <Braces className="size-4" />, tooltip: 'Not used' }
}

const ScriptListEntry = ({ id, onSelect }: { id: number; onSelect?: () => void }) => {
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
  const usage = getScriptUsage(script)

  const handleClick = () => {
    navigate(`/scripts/${id}`)
    onSelect?.()
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            "w-full text-left px-4 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2",
            isSelected && "bg-accent"
          )}
          onClick={handleClick}
        >
          <span className="text-muted-foreground flex-shrink-0">{usage.icon}</span>
          <span className="truncate">{script.name}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {usage.tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

interface ScriptEdits {
  id?: number,
  name?: string,
  script?: string,
  settings?: ScriptSetting[],
}

const NewScript = () => {
  const script: ScriptInput = {
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

const ScriptDisplay = ({ script, id }: { script: ScriptInput | ScriptDetails, id?: number }) => {
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
  const [playgroundKey, setPlaygroundKey] = useState(0)

  const navigate = useNavigate()

  const hasChanged = edits.name !== undefined || edits.script !== undefined || edits.settings !== undefined

  const { showConfirmDialog, confirmLeave, cancelLeave } = useUnsavedChanges(
    hasChanged,
    newId !== undefined
  )

  useEffect(() => {
    if (newId !== undefined) {
      navigate(`/scripts/${newId}`)
    }
  }, [newId, navigate])

  useEffect(() => {
    setEdits({ id })
    setPlaygroundKey(k => k + 1)
  }, [id])

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

  // Type guard for full script details (existing scripts have these properties)
  const hasUsageInfo = 'canDelete' in script

  const canReset = hasChanged && !isNew
  const canSave = hasChanged && scriptName !== "" && scriptScript !== ""
  const canDelete = !isNew && (hasUsageInfo ? script.canDelete : true)
  const cannotDeleteReason = hasUsageInfo ? script.cannotDeleteReason : null
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
      setPlaygroundKey(k => k + 1)
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

    // Normalize both values to handle whitespace differences from the playground
    const normalizedValue = value.trim()
    const normalizedOriginal = script.script.trim()

    if (normalizedValue !== normalizedOriginal) {
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

    if (!arraysEqual(updatedSettings, script.settings)) {
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

    if (!arraysEqual(updatedSettings, script.settings)) {
      updatedEdits.settings = updatedSettings
    }

    setEdits(updatedEdits)
  }

  return (
    <>
      <UnsavedChangesDialog
        open={showConfirmDialog}
        onConfirm={confirmLeave}
        onCancel={cancelLeave}
      />
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
        !isNew && id !== undefined && <DeleteConfirmAlert script={script as Script} open={deleteAlertOpen} setOpen={setDeleteAlertOpen} />
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
      <ScriptSettingsTable settings={settings} onAddSetting={addSetting} onRemoveSetting={removeSetting} />
      <Card className="p-4 m-2 flex flex-col overflow-hidden min-w-0">
        <div className="overflow-x-auto min-w-0">
          <ReactKotlinPlayground
            mode="kotlin"
            lines="true"
            onChange={onScriptChange}
            value={scriptPrefix + scriptScript + scriptSuffix}
            highlightOnFly="true"
            autocomplete="true"
            matchBrackets="true"
            theme={isDarkMode ? "darcula" : "idea"}
            key={`${id ?? "new"}-${playgroundKey}-${isDarkMode ? "dark" : "light"}`}
          />
        </div>
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
            {cannotDeleteReason && !isNew ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button variant="destructive" disabled>
                      Delete
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {cannotDeleteReason}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button variant="destructive" disabled={!canDelete} onClick={doDelete}>
                Delete
              </Button>
            )}
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

// Property display name mapping
const propertyDisplayNames: Record<string, string> = {
  loadFixturesScript: "Load Fixtures Script",
  trackChangedScript: "Track Changed Script",
  runLoopScript: "Run Loop Script",
}

// Helper to format a list of names with "and N more" truncation
const formatNameList = (names: string[], maxVisible: number = 3): { visible: string[], remaining: number } => {
  if (names.length <= maxVisible) {
    return { visible: names, remaining: 0 }
  }
  return { visible: names.slice(0, maxVisible), remaining: names.length - maxVisible }
}

const DeleteConfirmAlert = ({ script, open, setOpen }: {
  script: Script,
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>
}) => {
  const navigate = useNavigate()
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [runDeleteMutation] = useDeleteScriptMutation()

  const hasScenes = script.sceneNames.length > 0
  const hasChases = script.chaseNames.length > 0

  // Check for optional properties that will be cleared
  const clearableProperties = script.usedByProperties
    .filter(prop => prop === 'trackChangedScript' || prop === 'runLoopScript')
    .map(prop => propertyDisplayNames[prop] || prop)

  const hasWarnings = hasScenes || hasChases || clearableProperties.length > 0

  const sceneList = formatNameList(script.sceneNames)
  const chaseList = formatNameList(script.chaseNames)

  const handleDelete = async () => {
    setIsDeleting(true)
    setError(null)

    try {
      await runDeleteMutation(script.id).unwrap()
      navigate("/scripts")
      setOpen(false)
    } catch (err) {
      // Handle 409 Conflict or other errors
      const errorMessage = (err as { data?: { error?: string } })?.data?.error
        || 'Failed to delete script'
      setError(errorMessage)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Script?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogDescription>
            Are you sure you want to delete &quot;{script.name}&quot;?
          </DialogDescription>
          {hasWarnings && (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertDescription>
                <div className="space-y-3">
                  {hasScenes && (
                    <div>
                      <div className="font-medium mb-1">
                        This will delete {script.sceneNames.length} scene{script.sceneNames.length === 1 ? '' : 's'}:
                      </div>
                      <ul className="space-y-1 ml-1">
                        {sceneList.visible.map((name, index) => (
                          <li key={index} className="flex items-center gap-2">
                            <Spotlight className="size-4 text-muted-foreground flex-shrink-0" />
                            <span>{name}</span>
                          </li>
                        ))}
                        {sceneList.remaining > 0 && (
                          <li className="text-muted-foreground text-sm ml-6">
                            and {sceneList.remaining} more...
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                  {hasChases && (
                    <div>
                      <div className="font-medium mb-1">
                        This will delete {script.chaseNames.length} chase{script.chaseNames.length === 1 ? '' : 's'}:
                      </div>
                      <ul className="space-y-1 ml-1">
                        {chaseList.visible.map((name, index) => (
                          <li key={index} className="flex items-center gap-2">
                            <IterationCw className="size-4 text-muted-foreground shrink-0" />
                            <span>{name}</span>
                          </li>
                        ))}
                        {chaseList.remaining > 0 && (
                          <li className="text-muted-foreground text-sm ml-6">
                            and {chaseList.remaining} more...
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                  {clearableProperties.length > 0 && (
                    <div>
                      <div className="font-medium mb-1">
                        This will clear project settings:
                      </div>
                      <ul className="space-y-1 ml-1">
                        {script.usedByProperties
                          .filter(prop => prop === 'trackChangedScript' || prop === 'runLoopScript')
                          .map((prop, index) => (
                          <li key={index} className="flex items-center gap-2">
                            {prop === 'trackChangedScript' ? (
                              <Play className="size-4 text-muted-foreground shrink-0" />
                            ) : (
                              <Repeat className="size-4 text-muted-foreground flex-shrink-0" />
                            )}
                            <span>{propertyDisplayNames[prop] || prop}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
          <p className="text-sm text-destructive">
            This action cannot be undone.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


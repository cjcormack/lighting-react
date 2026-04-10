import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Wrench, Play, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
  SheetFooter,
} from '@/components/ui/sheet'
import { ScriptEditor } from './ScriptEditor'
import {
  ScriptCompileDialog,
  ScriptRunDialog,
} from './ScriptResultDialogs'
import {
  ALL_SCRIPT_TYPES,
  SCRIPT_TYPE_LABELS,
  SCRIPT_TYPE_DESCRIPTIONS,
  SCRIPT_TYPE_ICONS,
  SCRIPT_TYPE_TEMPLATES,
} from './scriptUtils'
import type { ProjectScriptDetail } from '@/api/projectApi'
import type { ScriptType } from '@/store/scripts'
import {
  useCreateProjectScriptMutation,
  useCompileProjectScriptMutation,
  useRunProjectScriptMutation,
  useSaveProjectScriptMutation,
  useDeleteProjectScriptMutation,
} from '@/store/projects'
import CopyScriptDialog from '@/CopyScriptDialog'

type FormView = 'type-picker' | 'form'

interface ScriptFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  script: ProjectScriptDetail | null
  projectId: number
  isCurrentProject: boolean
}

export function ScriptForm({
  open,
  onOpenChange,
  script,
  projectId,
  isCurrentProject,
}: ScriptFormProps) {
  const isCreate = script === null && isCurrentProject
  const canEdit = isCurrentProject && (script === null || script.canEdit !== false)

  // Mutations
  const [runCreate, { isLoading: isCreating }] = useCreateProjectScriptMutation()
  const [runSave, { isLoading: isSaving }] = useSaveProjectScriptMutation()
  const [runDelete] = useDeleteProjectScriptMutation()
  const [
    runCompile,
    { data: compileResult, isUninitialized: hasNotCompiled, isLoading: isCompiling, reset: resetCompile },
  ] = useCompileProjectScriptMutation()
  const [
    runRun,
    { data: runResult, isUninitialized: hasNotRun, isLoading: isRunning, reset: resetRun },
  ] = useRunProjectScriptMutation()

  // Multi-step view state
  const [view, setView] = useState<FormView>('form')

  // Local edit state
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [editType, setEditType] = useState<ScriptType>('GENERAL')
  const [copyDialogOpen, setCopyDialogOpen] = useState(false)

  // Track whether edits have been made (edit mode only — create uses computed check)
  const [hasEdited, setHasEdited] = useState(false)

  // Discard confirmation: what action to take if user confirms
  const [discardTarget, setDiscardTarget] = useState<'close' | 'back' | null>(null)

  // Reset state when sheet opens or script changes
  useEffect(() => {
    if (open) {
      if (script) {
        setEditName(script.name)
        setEditCode(script.script)
        setEditType(script.scriptType)
        setView('form')
      } else {
        setEditName('')
        setEditCode('')
        setEditType('GENERAL')
        setView(isCurrentProject ? 'type-picker' : 'form')
      }
      setHasEdited(false)
      setDiscardTarget(null)
      resetCompile()
      resetRun()
    }
  }, [open, script?.id, isCurrentProject, resetCompile, resetRun])

  const scriptType = script ? script.scriptType : editType

  const handleSelectType = (type: ScriptType) => {
    setEditType(type)
    setEditCode(SCRIPT_TYPE_TEMPLATES[type])
    setView('form')
  }

  const handleNameChange = (name: string) => {
    setEditName(name)
    if (script) setHasEdited(true)
  }

  const handleCodeChange = (code: string) => {
    setEditCode(code)
    if (script) setHasEdited(true)
  }

  const handleCompile = () => {
    runCompile({ projectId, script: editCode, scriptType })
  }

  const handleRun = () => {
    runRun({ projectId, script: editCode, scriptType, scriptId: script?.id })
  }

  const handleCreate = async () => {
    try {
      await runCreate({
        projectId,
        name: editName,
        script: editCode,
        scriptType: editType,
      }).unwrap()
      onOpenChange(false)
    } catch (err) {
      toast.error('Failed to create script', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const handleSave = async () => {
    if (!script) return
    try {
      await runSave({
        projectId,
        scriptId: script.id,
        name: editName,
        script: editCode,
        scriptType,
      }).unwrap()
      setHasEdited(false)
    } catch (err) {
      toast.error('Failed to save script', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const handleReset = () => {
    if (!script) return
    setEditName(script.name)
    setEditCode(script.script)
    setHasEdited(false)
  }

  const handleDelete = async () => {
    if (!script) return
    if (confirm(`Delete "${script.name}"?`)) {
      await runDelete({ projectId, scriptId: script.id }).unwrap()
      onOpenChange(false)
    }
  }

  // Compute dirty state: edit mode uses flag, create mode compares against defaults
  // Type picker step is never dirty (no user edits yet)
  const isDirty = script
    ? hasEdited
    : view === 'form' && (editName !== '' || editCode !== SCRIPT_TYPE_TEMPLATES[editType])

  const tryDiscard = useCallback((target: 'close' | 'back') => {
    if (!isDirty) return true
    setDiscardTarget(target)
    return false
  }, [isDirty])

  const handleConfirmDiscard = () => {
    const target = discardTarget
    setDiscardTarget(null)
    if (target === 'close') onOpenChange(false)
    else if (target === 'back') setView('type-picker')
  }

  const canCreate = editName !== '' && editCode !== ''
  const canSave = hasEdited && editName !== '' && editCode !== ''
  const canCompileOrRun = editCode !== ''

  const readOnly = !canEdit
  const title = view === 'type-picker'
    ? 'New Script'
    : isCreate
      ? `New ${SCRIPT_TYPE_LABELS[editType]} Script`
      : canEdit
        ? 'Edit Script'
        : script?.name ?? 'Script'

  const editorScript = { name: editName, script: editCode }

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

      <AlertDialog open={discardTarget !== null} onOpenChange={(open) => { if (!open) setDiscardTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes that will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDiscard}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {script && !isCurrentProject && (
        <CopyScriptDialog
          open={copyDialogOpen}
          setOpen={setCopyDialogOpen}
          sourceProjectId={projectId}
          scriptId={script.id}
          scriptName={script.name}
        />
      )}

      <Sheet open={open} onOpenChange={(value) => {
        if (!value) {
          if (!tryDiscard('close')) return
        }
        onOpenChange(value)
      }}>
        <SheetContent className="flex flex-col sm:max-w-2xl">
          {view === 'form' && isCreate ? (
            <div className="flex items-center gap-2 px-4 pt-4 pb-3">
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={() => { if (tryDiscard('back')) setView('type-picker') }}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <SheetTitle className="text-base">{title}</SheetTitle>
            </div>
          ) : (
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
            </SheetHeader>
          )}

          {view === 'type-picker' ? (
            /* Step 1: Type picker */
            <SheetBody className="space-y-0 p-0">
              <p className="text-sm text-muted-foreground px-4 pb-3">
                Choose the type of script to create. This cannot be changed later.
              </p>
              <div className="space-y-1 px-2">
                {ALL_SCRIPT_TYPES.map((type) => {
                  const Icon = SCRIPT_TYPE_ICONS[type]
                  return (
                    <button
                      key={type}
                      className="w-full flex items-start gap-3 px-3 py-3 rounded-md text-left hover:bg-accent/50 transition-colors"
                      onClick={() => handleSelectType(type)}
                    >
                      <div className="rounded-md bg-muted p-2 shrink-0 mt-0.5">
                        <Icon className="size-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{SCRIPT_TYPE_LABELS[type]}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {SCRIPT_TYPE_DESCRIPTIONS[type]}
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-1" />
                    </button>
                  )
                })}
              </div>
            </SheetBody>
          ) : (
            /* Step 2: Form (also used for edit/view) */
            <>
              <SheetBody>
                {/* Name */}
                {readOnly ? (
                  script ? (
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{script.name}</h3>
                      <Badge variant="secondary" className="text-xs">Read-only</Badge>
                    </div>
                  ) : null
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="script-form-name">Name</Label>
                    <Input
                      id="script-form-name"
                      required
                      value={editName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      autoFocus
                    />
                  </div>
                )}

                {/* Script type (read-only badge for all modes) */}
                <div className="flex items-center gap-2">
                  <Label>Type</Label>
                  <Badge variant="outline" className="text-xs">
                    {SCRIPT_TYPE_LABELS[scriptType]}
                  </Badge>
                </div>

                {/* Compile/Run buttons */}
                {canEdit && (
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canCompileOrRun || isCompiling}
                      onClick={handleCompile}
                    >
                      <Wrench className="size-4" />
                      Compile
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canCompileOrRun || isRunning}
                      onClick={handleRun}
                    >
                      <Play className="size-4" />
                      Run
                    </Button>
                  </div>
                )}

                {/* Code editor */}
                <ScriptEditor
                  script={editorScript}
                  id={script?.id ?? 'new'}
                  scriptType={scriptType}
                  readOnly={readOnly}
                  compact
                  onScriptChange={readOnly ? undefined : handleCodeChange}
                />
              </SheetBody>

              <SheetFooter
                className={
                  canEdit && script
                    ? 'flex-row justify-between'
                    : 'flex-row justify-end gap-2'
                }
              >
                {/* Edit mode: Delete on left, Reset+Save on right */}
                {canEdit && script && (
                  <>
                    <Button
                      variant="destructive"
                      disabled={script.canDelete === false}
                      onClick={handleDelete}
                    >
                      Delete
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="outline" disabled={!hasEdited} onClick={handleReset}>
                        Reset
                      </Button>
                      <Button disabled={!canSave || isSaving} onClick={handleSave}>
                        {isSaving ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  </>
                )}

                {/* Create mode */}
                {isCreate && (
                  <>
                    <Button variant="outline" onClick={() => {
                      if (tryDiscard('close')) onOpenChange(false)
                    }}>
                      Cancel
                    </Button>
                    <Button disabled={!canCreate || isCreating} onClick={handleCreate}>
                      {isCreating ? 'Creating...' : 'Create'}
                    </Button>
                  </>
                )}

                {/* Read-only: non-current project */}
                {!isCurrentProject && script && (
                  <>
                    <Button variant="outline" onClick={() => setCopyDialogOpen(true)}>
                      Copy to Project
                    </Button>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                      Close
                    </Button>
                  </>
                )}

                {/* Read-only: canEdit=false on current project */}
                {isCurrentProject && !canEdit && (
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Close
                  </Button>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

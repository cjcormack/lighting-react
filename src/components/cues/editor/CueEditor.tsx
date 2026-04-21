import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetBody,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, Loader2, Zap, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

import type {
  Cue,
  CueAdHocEffect,
  CueInput,
  CuePropertyAssignment,
  CueTriggerDetail,
} from '@/api/cuesApi'
import type { CueEditMode } from '@/api/cueEditWsApi'
import {
  EditorContextProvider,
  beginCueEditSession,
  endCueEditSession,
  setCueEditMode as sendSetCueEditMode,
} from '@/components/lighting-editor/EditorContext'
import { CueTriggerEditor } from '../CueTriggerEditor'
import { TriggerSummary } from '../TriggerSummary'
import { CueEditorHeader } from './CueEditorHeader'
import { CueTargetGrid, type TargetSelection } from './CueTargetGrid'
import { CueTargetDetail } from './CueTargetDetail'

interface CueEditorProps {
  /** When mounted in a sheet, the open flag is controlled by the caller. */
  open?: boolean
  onOpenChange?: (open: boolean) => void

  cue: Cue | null
  projectId: number
  isInStack?: boolean
  inheritedPalette?: string[]
  /** 'sheet' renders in a Radix Sheet; 'inline' renders without the sheet wrapper. */
  mode?: 'sheet' | 'inline'
  defaultEditMode?: CueEditMode

  onSave: (input: CueInput) => Promise<void>
  onDuplicate?: () => void
  onRemoveFromStack?: () => void
}

/**
 * Cue authoring surface built on the fixture/group detail modal primitives.
 * Opens a `cueEdit.*` session on mount and wraps children in an `EditorContext` so
 * property writes route through the session; closes on unmount.
 */
export function CueEditor({
  open = true,
  onOpenChange,
  cue,
  projectId,
  isInStack = false,
  inheritedPalette,
  mode = 'sheet',
  defaultEditMode = 'live',
  onSave,
  onDuplicate,
  onRemoveFromStack,
}: CueEditorProps) {
  const cueId = cue?.id ?? null
  const isEditing = cue !== null

  const [name, setName] = useState('')
  const [palette, setPalette] = useState<string[]>([])
  const [updateGlobalPalette, setUpdateGlobalPalette] = useState(false)
  const [presetApps, setPresetApps] = useState<Cue['presetApplications']>([])
  const [adHocEffects, setAdHocEffects] = useState<CueAdHocEffect[]>([])
  const [propertyAssignments, setPropertyAssignments] = useState<CuePropertyAssignment[]>([])
  const [triggers, setTriggers] = useState<CueTriggerDetail[]>([])
  const [autoAdvance, setAutoAdvance] = useState(false)
  const [autoAdvanceDelayMs, setAutoAdvanceDelayMs] = useState<string>('')
  const [fadeDurationMs, setFadeDurationMs] = useState<string>('')
  const [fadeCurve, setFadeCurve] = useState('LINEAR')
  const [cueNumber, setCueNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [editMode, setEditMode] = useState<CueEditMode>(defaultEditMode)
  const [gridTab, setGridTab] = useState<'groups' | 'fixtures'>('groups')
  const [selection, setSelection] = useState<TargetSelection | null>(null)
  const [editingTrigger, setEditingTrigger] = useState<
    | { kind: 'add' }
    | { kind: 'edit'; index: number }
    | null
  >(null)
  const [triggersExpanded, setTriggersExpanded] = useState(false)


  useEffect(() => {
    if (!open) return
    setName(cue?.name ?? '')
    setPalette(cue?.palette ?? [])
    setUpdateGlobalPalette(cue?.updateGlobalPalette ?? false)
    setPresetApps(cue?.presetApplications ?? [])
    setAdHocEffects(cue?.adHocEffects ?? [])
    setPropertyAssignments(cue?.propertyAssignments ?? [])
    setTriggers(cue?.triggers ?? [])
    setAutoAdvance(cue?.autoAdvance ?? false)
    setAutoAdvanceDelayMs(cue?.autoAdvanceDelayMs != null ? String(cue.autoAdvanceDelayMs) : '')
    setFadeDurationMs(cue?.fadeDurationMs != null ? String(cue.fadeDurationMs) : '')
    setFadeCurve(cue?.fadeCurve ?? 'LINEAR')
    setCueNumber(cue?.cueNumber ?? '')
    setNotes(cue?.notes ?? '')
    setError(null)
    setEditMode(defaultEditMode)
    setSelection(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cue?.id])

  const sessionIdRef = useRef<number | null>(null)
  useEffect(() => {
    if (!open || cueId == null) return
    if (sessionIdRef.current === cueId) return
    sessionIdRef.current = cueId
    beginCueEditSession(cueId, editMode)
    return () => {
      if (sessionIdRef.current != null) {
        endCueEditSession(sessionIdRef.current)
        sessionIdRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cueId])

  const handleEditModeChange = useCallback(
    (next: CueEditMode) => {
      setEditMode(next)
      if (cueId != null && sessionIdRef.current === cueId) {
        sendSetCueEditMode(cueId, next)
      }
    },
    [cueId],
  )

  const editorContextValue = useMemo(
    () =>
      cueId != null
        ? ({ kind: 'cue' as const, id: cueId, mode: editMode })
        : ({ kind: 'live' as const }),
    [cueId, editMode],
  )

  const isValid = name.trim().length > 0
  const handleSave = async () => {
    if (!isValid) {
      setError('Name is required')
      return
    }
    setIsSaving(true)
    try {
      const input: CueInput = {
        name: name.trim(),
        palette,
        updateGlobalPalette,
        presetApplications: presetApps.map((pa) => ({
          presetId: pa.presetId,
          targets: pa.targets,
          delayMs: pa.delayMs ?? null,
          intervalMs: pa.intervalMs ?? null,
          randomWindowMs: pa.randomWindowMs ?? null,
          sortOrder: pa.sortOrder ?? 0,
        })),
        adHocEffects,
        propertyAssignments,
        triggers: triggers.map(({ scriptName: _scriptName, ...rest }) => rest),
        autoAdvance,
        autoAdvanceDelayMs: autoAdvanceDelayMs ? Number(autoAdvanceDelayMs) : null,
        fadeDurationMs: fadeDurationMs ? Number(fadeDurationMs) : null,
        fadeCurve,
        cueNumber: cueNumber.trim() || null,
        notes: notes.trim() || null,
      }
      await onSave(input)
      onOpenChange?.(false)
    } catch (e) {
      if (e && typeof e === 'object' && 'status' in e && e.status === 409) {
        setError('A cue with this name already exists')
      } else {
        setError('Failed to save cue')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    onOpenChange?.(false)
  }

  // Gate Duplicate via the same isSaving flag as Save so rapid clicks can't
  // fire multiple create-cue requests while the network round-trip is in flight.
  const handleDuplicateClick = useCallback(async () => {
    if (!onDuplicate) return
    setIsSaving(true)
    try {
      await onDuplicate()
    } finally {
      setIsSaving(false)
    }
  }, [onDuplicate])

  const inner = (
    <EditorContextProvider value={editorContextValue}>
      <SheetBody>
        <CueEditorHeader
          isEditing={isEditing}
          mode={mode}
          name={name}
          onNameChange={(v) => {
            setName(v)
            setError(null)
          }}
          palette={palette}
          onPaletteChange={setPalette}
          inheritedPalette={inheritedPalette}
          updateGlobalPalette={updateGlobalPalette}
          onUpdateGlobalPaletteChange={setUpdateGlobalPalette}
          editMode={editMode}
          onEditModeChange={handleEditModeChange}
          isInStack={isInStack}
          cueNumber={cueNumber}
          onCueNumberChange={setCueNumber}
          notes={notes}
          onNotesChange={setNotes}
          autoAdvance={autoAdvance}
          onAutoAdvanceChange={setAutoAdvance}
          autoAdvanceDelayMs={autoAdvanceDelayMs}
          onAutoAdvanceDelayMsChange={setAutoAdvanceDelayMs}
          fadeDurationMs={fadeDurationMs}
          onFadeDurationMsChange={setFadeDurationMs}
          fadeCurve={fadeCurve}
          onFadeCurveChange={setFadeCurve}
          error={error}
        />

        <div className="space-y-3 border-t pt-3">
          <CueTargetGrid
            cue={cue}
            tab={gridTab}
            onTabChange={setGridTab}
            selection={selection}
            onSelectionChange={setSelection}
          />

          {selection && (
            <CueTargetDetail
              selection={selection}
              projectId={projectId}
              presetApps={presetApps}
              adHocEffects={adHocEffects}
              palette={palette.length > 0 ? palette : inheritedPalette ?? []}
              onAddPreset={(app) =>
                setPresetApps((prev) => [
                  ...prev,
                  {
                    presetId: app.presetId,
                    presetName: app.presetName,
                    targets: app.targets,
                    delayMs: app.delayMs,
                    intervalMs: app.intervalMs,
                    randomWindowMs: app.randomWindowMs,
                    sortOrder: prev.length,
                  },
                ])
              }
              onRemovePreset={(index) =>
                setPresetApps((prev) => prev.filter((_, i) => i !== index))
              }
              onAddEffect={(effect) => setAdHocEffects((prev) => [...prev, effect])}
              onUpdateEffect={(index, effect) =>
                setAdHocEffects((prev) => {
                  const next = [...prev]
                  next[index] = effect
                  return next
                })
              }
              onRemoveEffect={(index) =>
                setAdHocEffects((prev) => prev.filter((_, i) => i !== index))
              }
            />
          )}
        </div>

        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="flex items-center gap-2 text-left"
              onClick={() => setTriggersExpanded((v) => !v)}
            >
              <ChevronDown
                className={cn(
                  'size-3.5 transition-transform',
                  !triggersExpanded && '-rotate-90',
                )}
              />
              <Label className="flex items-center gap-1.5 cursor-pointer">
                <Zap className="size-3.5" />
                Script Hooks
                {triggers.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                    {triggers.length}
                  </Badge>
                )}
              </Label>
            </button>
            {triggersExpanded && editingTrigger == null && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setEditingTrigger({ kind: 'add' })}
              >
                <Plus className="size-3" />
                Add Hook
              </Button>
            )}
          </div>
          {triggersExpanded && (
            <div className="mt-2 space-y-2">
              {editingTrigger ? (
                <CueTriggerEditor
                  projectId={projectId}
                  trigger={
                    editingTrigger.kind === 'edit' ? triggers[editingTrigger.index] : undefined
                  }
                  onConfirm={(t) => {
                    if (editingTrigger.kind === 'add') {
                      setTriggers((prev) => [...prev, { ...t, scriptName: null }])
                    } else {
                      setTriggers((prev) => {
                        const next = [...prev]
                        next[editingTrigger.index] = { ...t, scriptName: null }
                        return next
                      })
                    }
                    setEditingTrigger(null)
                  }}
                  onCancel={() => setEditingTrigger(null)}
                  onRemove={
                    editingTrigger.kind === 'edit'
                      ? () => {
                          setTriggers((prev) => prev.filter((_, i) => i !== editingTrigger.index))
                          setEditingTrigger(null)
                        }
                      : undefined
                  }
                />
              ) : (
                <>
                  {triggers.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      No script hooks. Hooks run FX Application scripts at cue lifecycle events.
                    </p>
                  )}
                  {triggers.map((trigger, index) => (
                    <TriggerSummary
                      key={`trigger-${index}`}
                      trigger={trigger}
                      onClick={() => setEditingTrigger({ kind: 'edit', index })}
                      onRemove={() => setTriggers((prev) => prev.filter((_, i) => i !== index))}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </SheetBody>

      <SheetFooter
        className={
          isInStack && isEditing ? 'flex-row justify-between' : 'flex-row justify-end gap-2'
        }
      >
        {isInStack && isEditing ? (
          <>
            <div className="flex gap-2">
              {onRemoveFromStack && (
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={onRemoveFromStack}
                  disabled={isSaving}
                >
                  Remove
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {onDuplicate && (
                <Button variant="outline" onClick={handleDuplicateClick} disabled={isSaving}>
                  Duplicate
                </Button>
              )}
              <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!isValid || isSaving}>
                {isSaving && <Loader2 className="size-4 mr-2 animate-spin" />}
                Save
              </Button>
            </div>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!isValid || isSaving}>
              {isSaving && <Loader2 className="size-4 mr-2 animate-spin" />}
              {isEditing ? 'Save' : 'Create'}
            </Button>
          </>
        )}
      </SheetFooter>
    </EditorContextProvider>
  )

  if (mode === 'inline') {
    return <div className="flex flex-col h-full">{inner}</div>
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange ?? (() => {})}>
      <SheetContent side="right" className="flex flex-col sm:max-w-2xl">
        {inner}
      </SheetContent>
    </Sheet>
  )
}

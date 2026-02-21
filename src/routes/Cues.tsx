import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Loader2,
  Plus,
  Clapperboard,
  Pencil,
  Trash2,
  Copy,
  CopyPlus,
  Play,
  Square,
  Palette,
  Bookmark,
  AudioWaveform,
  ChevronDown,
  ChevronRight,
  Globe,
  RotateCcw,
  Replace,
  MoreHorizontal,
  ArrowRightLeft,
  LogOut,
  GripVertical,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import {
  useProjectCueListQuery,
  useCreateProjectCueMutation,
  useSaveProjectCueMutation,
  useDeleteProjectCueMutation,
  useApplyCueMutation,
  useStopCueMutation,
  useLazyCurrentCueStateQuery,
  useActiveCueIds,
  useActiveCueStackIds,
  useStackActiveCueIds,
  useStackPalettes,
} from '../store/cues'
import {
  useProjectCueStackListQuery,
  useCreateProjectCueStackMutation,
  useSaveProjectCueStackMutation,
  useDeleteProjectCueStackMutation,
  useActivateCueStackMutation,
  useDeactivateCueStackMutation,
  useAdvanceCueStackMutation,
  useGoToCueInStackMutation,
  useAddCueToCueStackMutation,
  useRemoveCueFromCueStackMutation,
  useReorderCueStackCuesMutation,
} from '../store/cueStacks'
import { setPalette } from '../store/fx'
import { CueForm } from '../components/cues/CueForm'
import { CueStackForm } from '../components/cues/CueStackForm'
import { CueStackHeader } from '../components/cues/CueStackHeader'
import {
  CueStackSidebar,
  CueStackMobileSheet,
  type CueStackView,
} from '../components/cues/CueStackPanel'
import { CopyCueDialog } from '../components/cues/CopyCueDialog'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { useProjectPresetListQuery } from '../store/fxPresets'
import type { FxPreset } from '../api/fxPresetsApi'
import type { Cue, CueInput, CueCurrentState } from '../api/cuesApi'
import type { CueStack, CueStackInput } from '../api/cueStacksApi'
import { EffectSummary } from '../components/fx/EffectSummary'
import { PresetApplicationSummary } from '../components/fx/PresetApplicationSummary'
import { fromPresetEffect, fromCueAdHocEffect } from '../components/fx/effectSummaryTypes'
import { useEffectLibraryQuery } from '../store/fixtureFx'

// Redirect /cues → /projects/:projectId/cues/all
export function CuesRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/cues/all`, { replace: true })
    }
  }, [currentProject, isLoading, navigate])

  if (isLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  return null
}

// Redirect /projects/:projectId/cues → /projects/:projectId/cues/all
export function CuesBaseRedirect() {
  const { projectId } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    navigate(`/projects/${projectId}/cues/all`, { replace: true })
  }, [navigate, projectId])

  return null
}

// Main cues management route
export function ProjectCues() {
  const { projectId, stackId: stackIdParam } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const projectIdNum = Number(projectId)
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const { data: cues, isLoading: cuesLoading } = useProjectCueListQuery(projectIdNum)
  const { data: stacks } = useProjectCueStackListQuery(projectIdNum)
  const { data: presets } = useProjectPresetListQuery(projectIdNum)
  const { data: library } = useEffectLibraryQuery()

  const [createCue, { isLoading: isCreating }] = useCreateProjectCueMutation()
  const [saveCue, { isLoading: isSaving }] = useSaveProjectCueMutation()
  const [deleteCue, { isLoading: isDeleting }] = useDeleteProjectCueMutation()
  const [applyCue] = useApplyCueMutation()
  const [stopCue] = useStopCueMutation()
  const [fetchCurrentState] = useLazyCurrentCueStateQuery()
  const activeCueIds = useActiveCueIds()
  const activeCueStackIds = useActiveCueStackIds()
  const stackActiveCueIds = useStackActiveCueIds()
  const stackPalettes = useStackPalettes()

  // Cue stack mutations
  const [createStack, { isLoading: isCreatingStack }] = useCreateProjectCueStackMutation()
  const [saveStack, { isLoading: isSavingStack }] = useSaveProjectCueStackMutation()
  const [deleteStack] = useDeleteProjectCueStackMutation()
  const [activateStack] = useActivateCueStackMutation()
  const [deactivateStack] = useDeactivateCueStackMutation()
  const [advanceStack, { isLoading: isAdvancing }] = useAdvanceCueStackMutation()
  const [goToCueInStack] = useGoToCueInStackMutation()
  const [addCueToStack] = useAddCueToCueStackMutation()
  const [removeCueFromStack] = useRemoveCueFromCueStackMutation()
  const [reorderCues] = useReorderCueStackCuesMutation()

  // Derive selectedView entirely from URL path
  const selectedView: CueStackView = stackIdParam
    ? Number(stackIdParam)
    : location.pathname.endsWith('/standalone')
      ? 'standalone'
      : 'all'

  const handleSelectView = useCallback(
    (view: CueStackView) => {
      if (typeof view === 'number') {
        navigate(`/projects/${projectId}/cues/stacks/${view}`)
      } else {
        navigate(`/projects/${projectId}/cues/${view}`)
      }
    },
    [navigate, projectId],
  )

  // UI state
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingCue, setEditingCue] = useState<Cue | null>(null)
  const [copyingCue, setCopyingCue] = useState<Cue | null>(null)
  const [deletingCue, setDeletingCue] = useState<Cue | null>(null)
  const [duplicatingCue, setDuplicatingCue] = useState<Cue | null>(null)
  const [duplicateName, setDuplicateName] = useState('')
  const [expandedCueIds, setExpandedCueIds] = useState<Set<number>>(new Set())
  const [initialState, setInitialState] = useState<CueCurrentState | undefined>()

  // Stack form state
  const [stackFormOpen, setStackFormOpen] = useState(false)
  const [editingStack, setEditingStack] = useState<CueStack | null>(null)

  // Delete stack confirmation
  const [deletingStack, setDeletingStack] = useState<CueStack | null>(null)
  const [deleteStackKeepCues, setDeleteStackKeepCues] = useState(true)

  // Move to stack state
  const [movingCue, setMovingCue] = useState<Cue | null>(null)

  const isCurrentProject = currentProject?.id === projectIdNum

  // Derived data
  const standaloneCueCount = useMemo(
    () => cues?.filter((c) => c.cueStackId == null).length ?? 0,
    [cues],
  )
  const totalCueCount = cues?.length ?? 0

  const selectedStack = useMemo(() => {
    if (typeof selectedView === 'number') {
      return stacks?.find((s) => s.id === selectedView) ?? null
    }
    return null
  }, [selectedView, stacks])

  // Redirect to all-cues view if the stack ID in the URL doesn't match any loaded stack
  useEffect(() => {
    if (stackIdParam && stacks && !stacks.find((s) => s.id === Number(stackIdParam))) {
      navigate(`/projects/${projectId}/cues/all`, { replace: true })
    }
  }, [stackIdParam, stacks, navigate, projectId])

  const selectedViewLabel = useMemo(() => {
    if (selectedView === 'all') return 'All Cues'
    if (selectedView === 'standalone') return 'Standalone'
    return selectedStack?.name ?? 'Stack'
  }, [selectedView, selectedStack])

  // Filter cues based on selected view
  const filteredCues = useMemo(() => {
    if (!cues) return []
    switch (selectedView) {
      case 'all':
        return cues
      case 'standalone':
        return cues.filter((c) => c.cueStackId == null)
      default: {
        // Stack view: show cues belonging to this stack, ordered by sortOrder
        const stackCues = cues
          .filter((c) => c.cueStackId === selectedView)
          .sort((a, b) => a.sortOrder - b.sortOrder)
        return stackCues
      }
    }
  }, [cues, selectedView])

  // Drag-and-drop sensors for cue reordering within stacks
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id || typeof selectedView !== 'number') return

      const oldIndex = filteredCues.findIndex((c) => c.id === active.id)
      const newIndex = filteredCues.findIndex((c) => c.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(filteredCues, oldIndex, newIndex)
      reorderCues({
        projectId: projectIdNum,
        stackId: selectedView,
        cueIds: reordered.map((c) => c.id),
      })
    },
    [filteredCues, selectedView, projectIdNum, reorderCues],
  )

  const toggleCueExpanded = (cueId: number) => {
    setExpandedCueIds((prev) => {
      const next = new Set(prev)
      if (next.has(cueId)) {
        next.delete(cueId)
      } else {
        next.add(cueId)
      }
      return next
    })
  }

  // Compute inherited palette for a cue in a stack: walk backwards through
  // the stack's cues (before the given cue) to find the last one with a non-empty
  // palette, falling back to the stack's own base palette.
  // If beforeCueId is omitted, walks from the end (for new cues appended at the end).
  const computeInheritedPalette = useCallback(
    (stackId: number, beforeCueId?: number): string[] => {
      const stack = stacks?.find((s) => s.id === stackId)
      if (!stack) return []

      const stackCues = (cues ?? [])
        .filter((c) => c.cueStackId === stackId)
        .sort((a, b) => a.sortOrder - b.sortOrder)

      // Determine the starting index: just before the given cue, or from the end
      let startIdx = stackCues.length - 1
      if (beforeCueId != null) {
        const cueIdx = stackCues.findIndex((c) => c.id === beforeCueId)
        if (cueIdx >= 0) startIdx = cueIdx - 1
      }

      for (let i = startIdx; i >= 0; i--) {
        if (stackCues[i].palette.length > 0) {
          return stackCues[i].palette
        }
      }

      // Fall back to the stack's base palette
      return stack.palette
    },
    [cues, stacks],
  )

  const handleCreate = async () => {
    setEditingCue(null)
    if (typeof selectedView === 'number') {
      // Creating in a stack: start empty, use inherited palette for context
      setInitialState(undefined)
    } else {
      // Standalone cue: pre-populate from current state
      try {
        const result = await fetchCurrentState(projectIdNum).unwrap()
        setInitialState(result)
      } catch {
        setInitialState(undefined)
      }
    }
    setFormOpen(true)
  }

  const handleEdit = (cue: Cue) => {
    setEditingCue(cue)
    setFormOpen(true)
  }

  const handleRowTap = (cue: Cue) => {
    if (isCurrentProject) {
      // If viewing an active stack, tapping a cue goes to that cue in the stack
      if (
        typeof selectedView === 'number' &&
        activeCueStackIds.has(selectedView) &&
        cue.cueStackId === selectedView
      ) {
        goToCueInStack({
          projectId: projectIdNum,
          stackId: selectedView,
          cueId: cue.id,
        })
        return
      }
      // Toggle: apply if not active, stop if active
      if (activeCueIds.has(cue.id)) {
        handleStop(cue)
      } else {
        handleApply(cue)
      }
    } else {
      setCopyingCue(cue)
    }
  }

  const handleApply = async (cue: Cue, replaceAll?: boolean) => {
    try {
      await applyCue({ projectId: projectIdNum, cueId: cue.id, replaceAll }).unwrap()
    } catch {
      // Error could be shown via toast
    }
  }

  const handleStop = async (cue: Cue) => {
    try {
      await stopCue({ projectId: projectIdNum, cueId: cue.id }).unwrap()
    } catch {
      // Error could be shown via toast
    }
  }

  const handleCopyPaletteToGlobal = (cue: Cue) => {
    if (cue.palette.length > 0) {
      setPalette(cue.palette)
    }
  }

  const handleDuplicate = (cue: Cue) => {
    const existingNames = new Set(cues?.map((c) => c.name) ?? [])
    let newName = `${cue.name} (Copy)`
    if (existingNames.has(newName)) {
      let n = 2
      while (existingNames.has(`${cue.name} (Copy ${n})`)) n++
      newName = `${cue.name} (Copy ${n})`
    }
    setDuplicateName(newName)
    setDuplicatingCue(cue)
  }

  const handleDuplicateConfirmed = async () => {
    if (!duplicatingCue || !duplicateName.trim()) return
    await createCue({
      projectId: projectIdNum,
      name: duplicateName.trim(),
      palette: duplicatingCue.palette,
      updateGlobalPalette: duplicatingCue.updateGlobalPalette,
      presetApplications: duplicatingCue.presetApplications.map((pa) => ({
        presetId: pa.presetId,
        targets: pa.targets,
      })),
      adHocEffects: duplicatingCue.adHocEffects,
      cueStackId: duplicatingCue.cueStackId,
    }).unwrap()
    setDuplicatingCue(null)
  }

  const handleSave = async (input: CueInput) => {
    if (editingCue) {
      await saveCue({
        projectId: projectIdNum,
        cueId: editingCue.id,
        ...input,
      }).unwrap()
    } else {
      // If creating from a stack view, auto-assign to that stack
      const stackId =
        typeof selectedView === 'number' ? selectedView : undefined
      await createCue({
        projectId: projectIdNum,
        ...input,
        ...(stackId ? { cueStackId: stackId } : {}),
      }).unwrap()
    }
  }

  const handleDeleteConfirmed = async () => {
    if (!deletingCue) return
    await deleteCue({
      projectId: projectIdNum,
      cueId: deletingCue.id,
    }).unwrap()
    setDeletingCue(null)
  }

  // Stack handlers
  const handleCreateStack = () => {
    setEditingStack(null)
    setStackFormOpen(true)
  }

  const handleEditStack = (stack: CueStack) => {
    setEditingStack(stack)
    setStackFormOpen(true)
  }

  const handleSaveStack = async (input: CueStackInput) => {
    if (editingStack) {
      await saveStack({
        projectId: projectIdNum,
        stackId: editingStack.id,
        ...input,
      }).unwrap()
    } else {
      const result = await createStack({
        projectId: projectIdNum,
        ...input,
      }).unwrap()
      // Select the newly created stack
      handleSelectView(result.id)
    }
  }

  const handleDeleteStack = async () => {
    if (!deletingStack) return
    await deleteStack({
      projectId: projectIdNum,
      stackId: deletingStack.id,
      keepCues: deleteStackKeepCues,
    }).unwrap()
    // If we were viewing this stack, go back to all
    if (selectedView === deletingStack.id) {
      handleSelectView('all')
    }
    setDeletingStack(null)
  }

  const handleActivateStack = (stackId: number) => {
    activateStack({ projectId: projectIdNum, stackId })
  }

  const handleDeactivateStack = (stackId: number) => {
    deactivateStack({ projectId: projectIdNum, stackId })
  }

  const handleAdvanceStack = (stackId: number) => {
    advanceStack({
      projectId: projectIdNum,
      stackId,
      direction: 'FORWARD',
    })
  }

  const handleAdvanceBackward = (stackId: number) => {
    advanceStack({
      projectId: projectIdNum,
      stackId,
      direction: 'BACKWARD',
    })
  }

  const handleMoveToStack = (cue: Cue) => {
    setMovingCue(cue)
  }

  const handleMoveToStackConfirmed = async (targetStackId: number) => {
    if (!movingCue) return
    await addCueToStack({
      projectId: projectIdNum,
      stackId: targetStackId,
      cueId: movingCue.id,
    }).unwrap()
    setMovingCue(null)
  }

  const handleRemoveFromStack = async (cue: Cue) => {
    if (cue.cueStackId == null) return
    await removeCueFromStack({
      projectId: projectIdNum,
      stackId: cue.cueStackId,
      cueId: cue.id,
    }).unwrap()
  }

  if (projectLoading || currentLoading || cuesLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  if (!project) {
    return (
      <Card className="m-4 p-4 text-center text-muted-foreground">Project not found</Card>
    )
  }

  // Panel props shared between desktop sidebar and mobile sheet
  const panelProps = {
    stacks: stacks ?? [],
    selectedView,
    onSelectView: handleSelectView,
    activeStackIds: activeCueStackIds,
    standaloneCueCount,
    totalCueCount,
    onCreateStack: handleCreateStack,
  }

  const cueListContent =
    filteredCues.length === 0 ? (
      <Card className="p-8 text-center">
        <Clapperboard className="size-10 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">
          {typeof selectedView === 'number'
            ? 'No cues in this stack yet.'
            : isCurrentProject
              ? 'No cues yet. Create one to save a complete look (palette + effects).'
              : 'No cues in this project.'}
        </p>
        {isCurrentProject && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 mt-4"
            onClick={handleCreate}
          >
            <Plus className="size-4" />
            New Cue
          </Button>
        )}
      </Card>
    ) : (
      <CueListRows
        filteredCues={filteredCues}
        presets={presets}
        library={library}
        isCurrentProject={isCurrentProject}
        activeCueIds={activeCueIds}
        activeCueStackIds={activeCueStackIds}
        stackActiveCueIds={stackActiveCueIds}
        expandedCueIds={expandedCueIds}
        stacks={stacks}
        selectedView={selectedView}
        onToggleExpand={toggleCueExpanded}
        onRowTap={handleRowTap}
        onApply={handleApply}
        onStop={handleStop}
        onCopyPaletteToGlobal={handleCopyPaletteToGlobal}
        onEdit={handleEdit}
        onDelete={setDeletingCue}
        onDuplicate={handleDuplicate}
        onCopy={setCopyingCue}
        onMoveToStack={handleMoveToStack}
        onRemoveFromStack={handleRemoveFromStack}
        isSortable={typeof selectedView === 'number' && isCurrentProject}
        dndSensors={dndSensors}
        onDragEnd={handleDragEnd}
      />
    )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 space-y-4">
        <Breadcrumbs
          projectName={project.name}
          currentPage="Cues"
          extra={[selectedViewLabel]}
          onCurrentPageClick={() => handleSelectView('all')}
        />
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">Cues</h1>
            <p className="text-sm text-muted-foreground">
              {isCurrentProject
                ? 'Save and recall complete looks (palette + effects) with a single click.'
                : `Viewing cues for "${project.name}". Copy cues to your active project to use them.`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Mobile stack filter trigger */}
            {!isDesktop && isCurrentProject && (
              <CueStackMobileSheet
                open={mobileSheetOpen}
                onOpenChange={setMobileSheetOpen}
                selectedViewLabel={selectedViewLabel}
                {...panelProps}
              />
            )}
            {isCurrentProject && (
              <Button onClick={handleCreate} size="sm" className="gap-1.5">
                <Plus className="size-4" />
                <span className="hidden sm:inline">New Cue</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Two-pane layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop sidebar */}
        {isDesktop && isCurrentProject && (
          <CueStackSidebar {...panelProps} />
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Stack header (when viewing a specific stack) */}
          {selectedStack && isCurrentProject && (
            <CueStackHeader
              stack={selectedStack}
              isActive={activeCueStackIds.has(selectedStack.id)}
              isAdvancing={isAdvancing}
              effectivePalette={stackPalettes[selectedStack.id]}
              onActivate={() => handleActivateStack(selectedStack.id)}
              onDeactivate={() => handleDeactivateStack(selectedStack.id)}
              onAdvanceForward={() => handleAdvanceStack(selectedStack.id)}
              onAdvanceBackward={() => handleAdvanceBackward(selectedStack.id)}
              onEdit={() => handleEditStack(selectedStack)}
            />
          )}

          {/* Cue list */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
            {cueListContent}
          </div>
        </div>
      </div>

      {/* Create/Edit cue form (Sheet) */}
      <CueForm
        open={formOpen}
        onOpenChange={setFormOpen}
        cue={editingCue}
        projectId={projectIdNum}
        onSave={handleSave}
        isSaving={isCreating || isSaving}
        initialState={!editingCue ? initialState : undefined}
        isInStack={editingCue ? editingCue.cueStackId != null : typeof selectedView === 'number'}
        inheritedPalette={
          !editingCue && typeof selectedView === 'number'
            ? computeInheritedPalette(selectedView)
            : editingCue?.cueStackId != null
              ? computeInheritedPalette(editingCue.cueStackId, editingCue.id)
              : undefined
        }
      />

      {/* Create/Edit stack form (Sheet) */}
      <CueStackForm
        open={stackFormOpen}
        onOpenChange={setStackFormOpen}
        stack={editingStack}
        onSave={handleSaveStack}
        isSaving={isCreatingStack || isSavingStack}
      />

      {/* Copy dialog */}
      {copyingCue && (
        <CopyCueDialog
          open={true}
          setOpen={(open) => {
            if (!open) setCopyingCue(null)
          }}
          sourceProjectId={projectIdNum}
          cueId={copyingCue.id}
          cueName={copyingCue.name}
        />
      )}

      {/* Delete cue confirmation */}
      {deletingCue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="max-w-sm mx-4 p-6 space-y-4">
            <div>
              <h3 className="font-semibold">Delete Cue</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Are you sure you want to delete &ldquo;{deletingCue.name}&rdquo;?
                This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeletingCue(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteConfirmed}
                disabled={isDeleting}
              >
                {isDeleting && <Loader2 className="size-4 mr-2 animate-spin" />}
                Delete
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Delete stack confirmation */}
      <Dialog
        open={!!deletingStack}
        onOpenChange={(open) => {
          if (!open) setDeletingStack(null)
        }}
      >
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Stack</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{deletingStack?.name}&rdquo;? Choose what happens to
              its cues.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={deleteStackKeepCues}
                onChange={() => setDeleteStackKeepCues(true)}
              />
              Keep cues (become standalone)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={!deleteStackKeepCues}
                onChange={() => setDeleteStackKeepCues(false)}
              />
              Delete cues too
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeletingStack(null)}
            >
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteStack}>
              Delete Stack
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate name prompt */}
      <Dialog
        open={!!duplicatingCue}
        onOpenChange={(open) => {
          if (!open) setDuplicatingCue(null)
        }}
      >
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Duplicate Cue</DialogTitle>
            <DialogDescription>Enter a name for the new cue.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={duplicateName}
            onChange={(e) => setDuplicateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && duplicateName.trim())
                handleDuplicateConfirmed()
            }}
            placeholder="Cue name"
          />
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDuplicatingCue(null)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleDuplicateConfirmed}
              disabled={isCreating || !duplicateName.trim()}
            >
              {isCreating && <Loader2 className="size-4 mr-2 animate-spin" />}
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to stack dialog */}
      <Dialog
        open={!!movingCue}
        onOpenChange={(open) => {
          if (!open) setMovingCue(null)
        }}
      >
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Move to Stack</DialogTitle>
            <DialogDescription>
              Choose a stack for &ldquo;{movingCue?.name}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            {stacks
              ?.filter((s) => s.id !== movingCue?.cueStackId)
              .map((s) => (
                <button
                  key={s.id}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent/50 transition-colors text-left"
                  onClick={() => handleMoveToStackConfirmed(s.id)}
                >
                  <Clapperboard className="size-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{s.name}</span>
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {s.cues.length}
                  </Badge>
                </button>
              ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMovingCue(null)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Extracted cue list rendering — supports optional DnD reordering when viewing a stack
function CueListRows({
  filteredCues,
  presets,
  library,
  isCurrentProject,
  activeCueIds,
  activeCueStackIds,
  stackActiveCueIds,
  expandedCueIds,
  stacks,
  selectedView,
  onToggleExpand,
  onRowTap,
  onApply,
  onStop,
  onCopyPaletteToGlobal,
  onEdit,
  onDelete,
  onDuplicate,
  onCopy,
  onMoveToStack,
  onRemoveFromStack,
  isSortable,
  dndSensors,
  onDragEnd,
}: {
  filteredCues: Cue[]
  presets?: FxPreset[]
  library?: import('@/store/fixtureFx').EffectLibraryEntry[]
  isCurrentProject: boolean
  activeCueIds: Set<number>
  activeCueStackIds: Set<number>
  stackActiveCueIds: Map<number, number>
  expandedCueIds: Set<number>
  stacks?: CueStack[]
  selectedView: CueStackView
  onToggleExpand: (cueId: number) => void
  onRowTap: (cue: Cue) => void
  onApply: (cue: Cue, replaceAll?: boolean) => void
  onStop: (cue: Cue) => void
  onCopyPaletteToGlobal: (cue: Cue) => void
  onEdit: (cue: Cue) => void
  onDelete: (cue: Cue) => void
  onDuplicate: (cue: Cue) => void
  onCopy: (cue: Cue) => void
  onMoveToStack: (cue: Cue) => void
  onRemoveFromStack: (cue: Cue) => void
  isSortable: boolean
  dndSensors: ReturnType<typeof useSensors>
  onDragEnd: (event: DragEndEvent) => void
}) {
  const renderRow = (cue: Cue, index: number) => (
    <CueListRow
      key={cue.id}
      cue={cue}
      presets={presets}
      library={library}
      isCurrentProject={isCurrentProject}
      isActive={activeCueIds.has(cue.id)}
      isFirst={index === 0}
      isLast={index === filteredCues.length - 1}
      hasOtherActiveCues={
        (activeCueIds.size > 0 && !activeCueIds.has(cue.id)) ||
        activeCueIds.size > 1
      }
      expanded={expandedCueIds.has(cue.id)}
      onToggleExpand={() => onToggleExpand(cue.id)}
      onTap={() => onRowTap(cue)}
      onApply={isCurrentProject ? () => onApply(cue) : undefined}
      onApplyReplace={
        isCurrentProject ? () => onApply(cue, true) : undefined
      }
      onStop={isCurrentProject ? () => onStop(cue) : undefined}
      onCopyPaletteToGlobal={
        isCurrentProject && cue.palette.length > 0
          ? () => onCopyPaletteToGlobal(cue)
          : undefined
      }
      onEdit={
        isCurrentProject && cue.canEdit ? () => onEdit(cue) : undefined
      }
      onDelete={
        isCurrentProject && cue.canDelete
          ? () => onDelete(cue)
          : undefined
      }
      onDuplicate={
        isCurrentProject ? () => onDuplicate(cue) : undefined
      }
      onCopy={!isCurrentProject ? () => onCopy(cue) : undefined}
      onMoveToStack={
        isCurrentProject && (stacks?.length ?? 0) > 0
          ? () => onMoveToStack(cue)
          : undefined
      }
      onRemoveFromStack={
        isCurrentProject && cue.cueStackId != null
          ? () => onRemoveFromStack(cue)
          : undefined
      }
      isInActiveStack={
        cue.cueStackId != null && activeCueStackIds.has(cue.cueStackId)
      }
      isActiveCueInStack={
        cue.cueStackId != null &&
        activeCueStackIds.has(cue.cueStackId) &&
        stackActiveCueIds.get(cue.cueStackId) === cue.id
      }
      stackName={cue.cueStackName}
      showStackBadge={selectedView === 'all' && cue.cueStackId != null}
      isSortable={isSortable}
    />
  )

  if (isSortable) {
    return (
      <DndContext
        sensors={dndSensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={filteredCues.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="rounded-lg border flex flex-col divide-y">
            {filteredCues.map((cue, index) => renderRow(cue, index))}
          </div>
        </SortableContext>
      </DndContext>
    )
  }

  return (
    <div className="rounded-lg border flex flex-col divide-y">
      {filteredCues.map((cue, index) => renderRow(cue, index))}
    </div>
  )
}

// Cue list row component — tap to toggle active, long-press / right-click for context menu
function CueListRow({
  cue,
  presets,
  library,
  isCurrentProject,
  isActive,
  isFirst,
  isLast,
  hasOtherActiveCues,
  expanded,
  onToggleExpand,
  onTap,
  onApply,
  onApplyReplace,
  onStop,
  onCopyPaletteToGlobal,
  onEdit,
  onDelete,
  onCopy,
  onDuplicate,
  onMoveToStack,
  onRemoveFromStack,
  isInActiveStack,
  isActiveCueInStack,
  stackName,
  showStackBadge,
  isSortable,
}: {
  cue: Cue
  presets?: FxPreset[]
  library?: import('@/store/fixtureFx').EffectLibraryEntry[]
  isCurrentProject: boolean
  isActive?: boolean
  isFirst?: boolean
  isLast?: boolean
  hasOtherActiveCues?: boolean
  expanded?: boolean
  onToggleExpand?: () => void
  onTap?: () => void
  onApply?: () => void
  onApplyReplace?: () => void
  onStop?: () => void
  onCopyPaletteToGlobal?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onCopy?: () => void
  onDuplicate?: () => void
  onMoveToStack?: () => void
  onRemoveFromStack?: () => void
  isInActiveStack?: boolean
  isActiveCueInStack?: boolean
  stackName?: string | null
  showStackBadge?: boolean
  isSortable?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cue.id, disabled: !isSortable })

  const sortableStyle = isSortable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
        opacity: isDragging ? 0.5 : undefined,
      }
    : undefined

  const presetCount = cue.presetApplications.length
  const adHocCount = cue.adHocEffects.length
  const hasExpandableContent = presetCount > 0 || adHocCount > 0

  // ── Long-press → open context menu (all pointer types) ──
  const triggerRef = useRef<HTMLDivElement>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)
  const startPos = useRef<{ x: number; y: number } | null>(null)
  const isLongPressPointer = useRef(false)

  const clearPress = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
    startPos.current = null
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Skip right-click — Radix ContextMenu handles that natively
      if (e.button === 2) return
      // Skip if the event originated from an interactive child (button, dropdown trigger, etc.)
      const target = e.target as HTMLElement
      if (
        target.closest(
          'button, [role="menuitem"], [data-slot="dropdown-menu-trigger"]',
        )
      )
        return
      isLongPressPointer.current = true
      didLongPress.current = false
      startPos.current = { x: e.clientX, y: e.clientY }
      const clientX = e.clientX
      const clientY = e.clientY
      pressTimer.current = setTimeout(() => {
        didLongPress.current = true
        pressTimer.current = null
        // Dispatch a synthetic contextmenu event so Radix ContextMenu opens at the press point
        triggerRef.current?.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            clientX,
            clientY,
          }),
        )
      }, 500)
    },
    [],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startPos.current) return
      const dx = e.clientX - startPos.current.x
      const dy = e.clientY - startPos.current.y
      if (dx * dx + dy * dy > 10 * 10) {
        clearPress()
      }
    },
    [clearPress],
  )

  const handlePointerUp = useCallback(() => {
    if (!isLongPressPointer.current) return
    isLongPressPointer.current = false
    const wasLongPress = didLongPress.current
    clearPress()
    if (!wasLongPress) {
      onTap?.()
    }
  }, [clearPress, onTap])

  // Shared menu item definitions used by both ContextMenu (long-press / right-click) and DropdownMenu (... button)
  type MenuItemDef = {
    icon: typeof Play
    label: string
    onClick: () => void
    variant?: 'destructive'
  }
  type MenuDef = (MenuItemDef | 'separator')[]

  const menuDefs: MenuDef = []
  if (isActive && onStop)
    menuDefs.push({ icon: Square, label: 'Stop', onClick: onStop })
  if (isActive && onApply)
    menuDefs.push({ icon: RotateCcw, label: 'Re-apply', onClick: onApply })
  if (!isActive && onApply)
    menuDefs.push({ icon: Play, label: 'Apply', onClick: onApply })
  if (hasOtherActiveCues && onApplyReplace)
    menuDefs.push({
      icon: Replace,
      label: 'Replace all & apply',
      onClick: onApplyReplace,
    })
  if (onCopyPaletteToGlobal)
    menuDefs.push({
      icon: Globe,
      label: 'Copy palette to global',
      onClick: onCopyPaletteToGlobal,
    })
  if (
    (onApply || onStop) &&
    (onEdit || onDuplicate || onCopy || onDelete || onMoveToStack || onRemoveFromStack)
  )
    menuDefs.push('separator')
  if (onEdit) menuDefs.push({ icon: Pencil, label: 'Edit', onClick: onEdit })
  if (onDuplicate)
    menuDefs.push({ icon: CopyPlus, label: 'Duplicate', onClick: onDuplicate })
  if (onCopy)
    menuDefs.push({ icon: Copy, label: 'Copy to Project', onClick: onCopy })
  if (onMoveToStack)
    menuDefs.push({
      icon: ArrowRightLeft,
      label: 'Move to Stack...',
      onClick: onMoveToStack,
    })
  if (onRemoveFromStack)
    menuDefs.push({
      icon: LogOut,
      label: 'Remove from Stack',
      onClick: onRemoveFromStack,
    })
  if (onDelete) {
    menuDefs.push('separator')
    menuDefs.push({
      icon: Trash2,
      label: 'Delete',
      onClick: onDelete,
      variant: 'destructive',
    })
  }

  const hasMenu = menuDefs.length > 0

  const isExpanded = expanded && hasExpandableContent

  // Determine active styling:
  // - For standalone cues, use the effect-based isActive flag.
  // - For cues in an active stack, use isActiveCueInStack which is derived from
  //   the real-time FxState WebSocket (highest effect ID per stack picks the
  //   newest cue, avoiding dual-highlight during crossfades).
  const isEffectivelyActive = isInActiveStack ? isActiveCueInStack : isActive

  const rowContent = (
    <div
      ref={(node) => {
        // Merge refs: triggerRef for long-press + setNodeRef for sortable
        ;(triggerRef as React.MutableRefObject<HTMLDivElement | null>).current = node
        setNodeRef(node)
      }}
      style={sortableStyle}
      className={cn(
        'border-l-[3px] transition-colors overflow-hidden',
        isEffectivelyActive ? 'border-l-primary' : 'border-l-transparent',
        isEffectivelyActive && isFirst && 'rounded-tl-lg',
        isEffectivelyActive && isLast && 'rounded-bl-lg',
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={clearPress}
      {...attributes}
    >
      <div
        className={cn(
          'group flex items-center gap-2 px-3 py-2.5 min-h-[44px] transition-colors select-none touch-manipulation',
          onTap && 'cursor-pointer',
          isEffectivelyActive
            ? 'bg-primary/10 hover:bg-primary/15'
            : 'hover:bg-accent/50',
        )}
      >
        {/* Drag handle (sortable in stack view) */}
        {isSortable && (
          <button
            className="size-5 flex items-center justify-center shrink-0 text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
            {...listeners}
            onPointerDown={(e) => {
              // Cancel long-press when starting a drag
              clearPress()
              isLongPressPointer.current = false
              listeners?.onPointerDown?.(e)
            }}
          >
            <GripVertical className="size-3.5" />
          </button>
        )}

        {/* Expand/collapse toggle */}
        {onToggleExpand && hasExpandableContent && (
          <button
            className="size-5 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand()
            }}
          >
            {expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        )}

        {/* Spacer when no expand toggle but others have it */}
        {onToggleExpand && !hasExpandableContent && (
          <div className="size-5 shrink-0" />
        )}

        {/* Name */}
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'font-medium text-sm truncate',
              isEffectivelyActive && 'text-primary',
            )}
          >
            {cue.name}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {/* Palette swatches preview (first 6) */}
            {cue.palette.length > 0 && (
              <div className="flex items-center gap-0.5">
                {cue.palette.slice(0, 6).map((colour, i) => {
                  // Extract just the hex part (before any semicolons)
                  const hex = colour.split(';')[0]
                  return (
                    <div
                      key={i}
                      className="size-3 rounded-sm border border-border/50"
                      style={{ backgroundColor: hex }}
                    />
                  )
                })}
                {cue.palette.length > 6 && (
                  <span className="text-[10px] text-muted-foreground ml-0.5">
                    +{cue.palette.length - 6}
                  </span>
                )}
              </div>
            )}
            {/* Stack badge when viewing all cues */}
            {showStackBadge && stackName && (
              <Badge
                variant="outline"
                className="text-[9px] px-1 py-0 gap-0.5"
              >
                <Clapperboard className="size-2.5" />
                {stackName}
              </Badge>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1 shrink-0">
          {cue.palette.length > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 gap-1"
            >
              <Palette className="size-3" />
              {cue.palette.length}
            </Badge>
          )}
          {presetCount > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 gap-1"
            >
              <Bookmark className="size-3" />
              {presetCount}
            </Badge>
          )}
          {adHocCount > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 gap-1"
            >
              <AudioWaveform className="size-3" />
              {adHocCount}
            </Badge>
          )}
        </div>

        {/* Overflow menu button */}
        {hasMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="size-7 flex items-center justify-center shrink-0 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                onPointerDown={(e) => {
                  // Cancel any pending long-press so the context menu doesn't also open
                  clearPress()
                  isLongPressPointer.current = false
                  e.stopPropagation()
                }}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {menuDefs.map((item, i) =>
                item === 'separator' ? (
                  <DropdownMenuSeparator key={i} />
                ) : (
                  <DropdownMenuItem
                    key={i}
                    onClick={item.onClick}
                    variant={item.variant}
                  >
                    <item.icon className="size-4 mr-2" />
                    {item.label}
                  </DropdownMenuItem>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* ── Expanded content: preset applications and ad-hoc effects ── */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 space-y-2 ml-5 bg-accent/30">
          {/* Preset applications */}
          {cue.presetApplications.map((pa, index) => {
            const fullPreset = presets?.find((p) => p.id === pa.presetId)
            const presetEffects = fullPreset?.effects ?? []

            return (
              <PresetApplicationSummary
                key={`preset-${index}`}
                presetName={pa.presetName}
                presetId={pa.presetId}
                effects={presetEffects.map((e) => fromPresetEffect(e, library))}
                targets={pa.targets}
                palette={cue.palette}
                onClick={onEdit}
              />
            )
          })}

          {/* Ad-hoc effects */}
          {cue.adHocEffects.map((effect, index) => (
            <EffectSummary
              key={`effect-${index}`}
              effect={fromCueAdHocEffect(effect, library)}
              target={{ type: effect.targetType, key: effect.targetKey }}
              palette={cue.palette}
              onClick={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{rowContent}</ContextMenuTrigger>
      <ContextMenuContent>
        {menuDefs.map((item, i) =>
          item === 'separator' ? (
            <ContextMenuSeparator key={i} />
          ) : (
            <ContextMenuItem
              key={i}
              onClick={item.onClick}
              variant={item.variant}
            >
              <item.icon className="size-4 mr-2" />
              {item.label}
            </ContextMenuItem>
          ),
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

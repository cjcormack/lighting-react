import { useEffect, useRef, useCallback, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
  Layers,
  LayoutGrid,
  Globe,
  RotateCcw,
  Replace,
  MoreHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
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
} from '../store/cues'
import { setPalette } from '../store/fx'
import { CueForm } from '../components/cues/CueForm'
import { CopyCueDialog } from '../components/cues/CopyCueDialog'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { useProjectPresetListQuery } from '../store/fxPresets'
import type { FxPreset } from '../api/fxPresetsApi'
import type { Cue, CueInput, CueAdHocEffect, CueCurrentState } from '../api/cuesApi'
import {
  EFFECT_CATEGORY_INFO,
  getBeatDivisionLabel,
  getDistributionLabel,
  getEffectDescription,
} from '../components/fx/fxConstants'

// Redirect /cues → /projects/:projectId/cues
export function CuesRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/cues`, { replace: true })
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

// Main cues management route
export function ProjectCues() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const { data: cues, isLoading: cuesLoading } = useProjectCueListQuery(projectIdNum)
  const { data: presets } = useProjectPresetListQuery(projectIdNum)

  const [createCue, { isLoading: isCreating }] = useCreateProjectCueMutation()
  const [saveCue, { isLoading: isSaving }] = useSaveProjectCueMutation()
  const [deleteCue, { isLoading: isDeleting }] = useDeleteProjectCueMutation()
  const [applyCue] = useApplyCueMutation()
  const [stopCue] = useStopCueMutation()
  const [fetchCurrentState] = useLazyCurrentCueStateQuery()
  const activeCueIds = useActiveCueIds()

  const [formOpen, setFormOpen] = useState(false)
  const [editingCue, setEditingCue] = useState<Cue | null>(null)
  const [copyingCue, setCopyingCue] = useState<Cue | null>(null)
  const [deletingCue, setDeletingCue] = useState<Cue | null>(null)
  const [duplicatingCue, setDuplicatingCue] = useState<Cue | null>(null)
  const [duplicateName, setDuplicateName] = useState('')
  const [expandedCueIds, setExpandedCueIds] = useState<Set<number>>(new Set())
  const [initialState, setInitialState] = useState<CueCurrentState | undefined>()

  const isCurrentProject = currentProject?.id === projectIdNum

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

  const handleCreate = async () => {
    setEditingCue(null)
    try {
      const result = await fetchCurrentState(projectIdNum).unwrap()
      setInitialState(result)
    } catch {
      setInitialState(undefined)
    }
    setFormOpen(true)
  }

  const handleEdit = (cue: Cue) => {
    setEditingCue(cue)
    setFormOpen(true)
  }

  const handleRowTap = (cue: Cue) => {
    if (isCurrentProject) {
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
      await createCue({
        projectId: projectIdNum,
        ...input,
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

  const totalCues = cues?.length ?? 0

  const cueListContent = totalCues === 0 ? (
    <Card className="p-8 text-center">
      <Clapperboard className="size-10 mx-auto text-muted-foreground/30 mb-3" />
      <p className="text-sm text-muted-foreground">
        {isCurrentProject
          ? 'No cues yet. Create one to save a complete look (palette + effects).'
          : 'No cues in this project.'}
      </p>
      {isCurrentProject && (
        <Button variant="outline" size="sm" className="gap-1.5 mt-4" onClick={handleCreate}>
          <Plus className="size-4" />
          New Cue
        </Button>
      )}
    </Card>
  ) : (
    <div className="rounded-lg border flex flex-col divide-y">
      {cues!.map((cue, index) => (
        <CueListRow
          key={cue.id}
          cue={cue}
          presets={presets}
          isCurrentProject={isCurrentProject}
          isActive={activeCueIds.has(cue.id)}
          isFirst={index === 0}
          isLast={index === cues!.length - 1}
          hasOtherActiveCues={activeCueIds.size > 0 && !activeCueIds.has(cue.id) || activeCueIds.size > 1}
          expanded={expandedCueIds.has(cue.id)}
          onToggleExpand={() => toggleCueExpanded(cue.id)}
          onTap={() => handleRowTap(cue)}
          onApply={isCurrentProject ? () => handleApply(cue) : undefined}
          onApplyReplace={isCurrentProject ? () => handleApply(cue, true) : undefined}
          onStop={isCurrentProject ? () => handleStop(cue) : undefined}
          onCopyPaletteToGlobal={isCurrentProject && cue.palette.length > 0 ? () => handleCopyPaletteToGlobal(cue) : undefined}
          onEdit={isCurrentProject && cue.canEdit ? () => handleEdit(cue) : undefined}
          onDelete={isCurrentProject && cue.canDelete ? () => setDeletingCue(cue) : undefined}
          onDuplicate={isCurrentProject ? () => handleDuplicate(cue) : undefined}
          onCopy={!isCurrentProject ? () => setCopyingCue(cue) : undefined}
        />
      ))}
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 space-y-4">
        <Breadcrumbs projectName={project.name} currentPage="Cues" />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Cues</h1>
            <p className="text-sm text-muted-foreground">
              {isCurrentProject
                ? 'Save and recall complete looks (palette + effects) with a single click.'
                : `Viewing cues for "${project.name}". Copy cues to your active project to use them.`}
            </p>
          </div>
          {isCurrentProject && (
            <Button onClick={handleCreate} size="sm" className="gap-1.5">
              <Plus className="size-4" />
              <span className="hidden sm:inline">New Cue</span>
            </Button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {cueListContent}
      </div>

      {/* Create/Edit form (Sheet) */}
      <CueForm
        open={formOpen}
        onOpenChange={setFormOpen}
        cue={editingCue}
        projectId={projectIdNum}
        onSave={handleSave}
        isSaving={isCreating || isSaving}
        initialState={!editingCue ? initialState : undefined}
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

      {/* Delete confirmation overlay */}
      {deletingCue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="max-w-sm mx-4 p-6 space-y-4">
            <div>
              <h3 className="font-semibold">Delete Cue</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Are you sure you want to delete &ldquo;{deletingCue.name}&rdquo;? This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeletingCue(null)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDeleteConfirmed} disabled={isDeleting}>
                {isDeleting && <Loader2 className="size-4 mr-2 animate-spin" />}
                Delete
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Duplicate name prompt */}
      <Dialog open={!!duplicatingCue} onOpenChange={(open) => { if (!open) setDuplicatingCue(null) }}>
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
              if (e.key === 'Enter' && duplicateName.trim()) handleDuplicateConfirmed()
            }}
            placeholder="Cue name"
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDuplicatingCue(null)} disabled={isCreating}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleDuplicateConfirmed} disabled={isCreating || !duplicateName.trim()}>
              {isCreating && <Loader2 className="size-4 mr-2 animate-spin" />}
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

// Cue list row component — tap to toggle active, long-press / right-click for context menu
function CueListRow({
  cue,
  presets,
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
}: {
  cue: Cue
  presets?: FxPreset[]
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
}) {
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

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Skip right-click — Radix ContextMenu handles that natively
    if (e.button === 2) return
    // Skip if the event originated from an interactive child (button, dropdown trigger, etc.)
    const target = e.target as HTMLElement
    if (target.closest('button, [role="menuitem"], [data-slot="dropdown-menu-trigger"]')) return
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
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!startPos.current) return
    const dx = e.clientX - startPos.current.x
    const dy = e.clientY - startPos.current.y
    if (dx * dx + dy * dy > 10 * 10) {
      clearPress()
    }
  }, [clearPress])

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
  type MenuItemDef = { icon: typeof Play; label: string; onClick: () => void; variant?: 'destructive' }
  type MenuDef = (MenuItemDef | 'separator')[]

  const menuDefs: MenuDef = []
  if (isActive && onStop) menuDefs.push({ icon: Square, label: 'Stop', onClick: onStop })
  if (isActive && onApply) menuDefs.push({ icon: RotateCcw, label: 'Re-apply', onClick: onApply })
  if (!isActive && onApply) menuDefs.push({ icon: Play, label: 'Apply', onClick: onApply })
  if (hasOtherActiveCues && onApplyReplace) menuDefs.push({ icon: Replace, label: 'Replace all & apply', onClick: onApplyReplace })
  if (onCopyPaletteToGlobal) menuDefs.push({ icon: Globe, label: 'Copy palette to global', onClick: onCopyPaletteToGlobal })
  if ((onApply || onStop) && (onEdit || onDuplicate || onCopy || onDelete)) menuDefs.push('separator')
  if (onEdit) menuDefs.push({ icon: Pencil, label: 'Edit', onClick: onEdit })
  if (onDuplicate) menuDefs.push({ icon: CopyPlus, label: 'Duplicate', onClick: onDuplicate })
  if (onCopy) menuDefs.push({ icon: Copy, label: 'Copy to Project', onClick: onCopy })
  if (onDelete) {
    menuDefs.push('separator')
    menuDefs.push({ icon: Trash2, label: 'Delete', onClick: onDelete, variant: 'destructive' })
  }

  const hasMenu = menuDefs.length > 0

  const isExpanded = expanded && hasExpandableContent

  const rowContent = (
    <div
      ref={triggerRef}
      className={cn(
        'border-l-[3px] transition-colors overflow-hidden',
        isActive
          ? 'border-l-primary'
          : 'border-l-transparent',
        isActive && isFirst && 'rounded-tl-lg',
        isActive && isLast && 'rounded-bl-lg',
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={clearPress}
    >
      <div
        className={cn(
          'group flex items-center gap-2 px-3 py-2.5 min-h-[44px] transition-colors select-none touch-manipulation',
          onTap && 'cursor-pointer',
          isActive
            ? 'bg-primary/10 hover:bg-primary/15'
            : 'hover:bg-accent/50',
        )}
        // Clicks handled via pointer events (handlePointerUp) for long-press detection
      >
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
          <div className={cn(
            'font-medium text-sm truncate',
            isActive && 'text-primary',
          )}>{cue.name}</div>
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
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1 shrink-0">
          {cue.palette.length > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
              <Palette className="size-3" />
              {cue.palette.length}
            </Badge>
          )}
          {presetCount > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
              <Bookmark className="size-3" />
              {presetCount}
            </Badge>
          )}
          {adHocCount > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
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
                  <DropdownMenuItem key={i} onClick={item.onClick} variant={item.variant}>
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
            const categories = [...new Set(presetEffects.map((e) => e.category))]

            return (
              <div
                key={`preset-${index}`}
                className="border rounded-lg p-3 space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <Bookmark className="size-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">
                    {pa.presetName ?? `Preset #${pa.presetId}`}
                  </span>
                  {/* Effect category icons */}
                  <div className="flex items-center gap-0.5">
                    {categories.map((cat) => {
                      const info = EFFECT_CATEGORY_INFO[cat]
                      if (!info) return null
                      const CatIcon = info.icon
                      return (
                        <span key={cat} title={info.label}>
                          <CatIcon className="size-3 text-muted-foreground" />
                        </span>
                      )
                    })}
                  </div>
                  {presetEffects.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {presetEffects.length} fx
                    </span>
                  )}
                </div>

                {/* Effect names */}
                {presetEffects.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {presetEffects.map((fx, fi) => {
                      const catInfo = EFFECT_CATEGORY_INFO[fx.category]
                      const FxIcon = catInfo?.icon
                      return (
                        <span key={fi} className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          {FxIcon && <FxIcon className="size-2.5" />}
                          {fx.effectType}
                        </span>
                      )
                    })}
                  </div>
                )}

                {/* Targets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {pa.targets.map((t, ti) => (
                    <span key={ti} className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                      {t.type === 'group' ? (
                        <Layers className="size-3" />
                      ) : (
                        <LayoutGrid className="size-3" />
                      )}
                      {t.key}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Ad-hoc effects */}
          {cue.adHocEffects.map((effect, index) => (
            <CueEffectDetail key={`effect-${index}`} effect={effect} />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {rowContent}
      </ContextMenuTrigger>
      <ContextMenuContent>
        {menuDefs.map((item, i) =>
          item === 'separator' ? (
            <ContextMenuSeparator key={i} />
          ) : (
            <ContextMenuItem key={i} onClick={item.onClick} variant={item.variant}>
              <item.icon className="size-4 mr-2" />
              {item.label}
            </ContextMenuItem>
          ),
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** Inline detail card for a cue ad-hoc effect (matches PresetEffectDetail pattern) */
function CueEffectDetail({ effect }: { effect: CueAdHocEffect }) {
  const categoryInfo = EFFECT_CATEGORY_INFO[effect.category]
  const CategoryIcon = categoryInfo?.icon
  const description = getEffectDescription(effect.effectType)
  const blendLabel =
    effect.blendMode !== 'OVERRIDE'
      ? effect.blendMode.charAt(0) + effect.blendMode.slice(1).toLowerCase()
      : null

  return (
    <div className="border rounded-lg p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        {CategoryIcon && <CategoryIcon className="size-4 text-muted-foreground shrink-0" />}
        <span className="text-sm font-medium">{effect.effectType}</span>
        <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
          {effect.targetType === 'group' ? (
            <Layers className="size-3" />
          ) : (
            <LayoutGrid className="size-3" />
          )}
          {effect.targetKey}
        </span>
      </div>

      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      {/* Parameters grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <span className="text-muted-foreground">Speed</span>
        <span>{getBeatDivisionLabel(effect.beatDivision)}</span>

        <span className="text-muted-foreground">Distribution</span>
        <span>{getDistributionLabel(effect.distribution)}</span>

        {blendLabel && (
          <>
            <span className="text-muted-foreground">Blend</span>
            <span>{blendLabel}</span>
          </>
        )}

        {effect.stepTiming && (
          <>
            <span className="text-muted-foreground">Step Timing</span>
            <span>Yes</span>
          </>
        )}

        {effect.phaseOffset !== 0 && (
          <>
            <span className="text-muted-foreground">Phase Offset</span>
            <span>{effect.phaseOffset}</span>
          </>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Loader2,
  Plus,
  Clapperboard,
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy,
  CopyPlus,
  Play,
  Palette,
  Bookmark,
  AudioWaveform,
  ChevronDown,
  ChevronRight,
  Layers,
  LayoutGrid,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import {
  useProjectCueListQuery,
  useCreateProjectCueMutation,
  useSaveProjectCueMutation,
  useDeleteProjectCueMutation,
  useApplyCueMutation,
  useLazyCurrentCueStateQuery,
} from '../store/cues'
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
  const [fetchCurrentState] = useLazyCurrentCueStateQuery()

  const [formOpen, setFormOpen] = useState(false)
  const [editingCue, setEditingCue] = useState<Cue | null>(null)
  const [copyingCue, setCopyingCue] = useState<Cue | null>(null)
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

  const handleRowClick = (cue: Cue) => {
    if (isCurrentProject) {
      handleEdit(cue)
    } else {
      setCopyingCue(cue)
    }
  }

  const handleApply = async (cue: Cue) => {
    try {
      await applyCue({ projectId: projectIdNum, cueId: cue.id }).unwrap()
    } catch {
      // Error could be shown via toast
    }
  }

  const handleDuplicate = async (cue: Cue) => {
    const existingNames = new Set(cues?.map((c) => c.name) ?? [])
    let newName = `${cue.name} (Copy)`
    if (existingNames.has(newName)) {
      let n = 2
      while (existingNames.has(`${cue.name} (Copy ${n})`)) n++
      newName = `${cue.name} (Copy ${n})`
    }

    await createCue({
      projectId: projectIdNum,
      name: newName,
      palette: cue.palette,
      presetApplications: cue.presetApplications.map((pa) => ({
        presetId: pa.presetId,
        targets: pa.targets,
      })),
      adHocEffects: cue.adHocEffects,
    }).unwrap()
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

  const handleDelete = async () => {
    if (!editingCue) return
    await deleteCue({
      projectId: projectIdNum,
      cueId: editingCue.id,
    }).unwrap()
    setFormOpen(false)
    setEditingCue(null)
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
      {cues!.map((cue) => (
        <CueListRow
          key={cue.id}
          cue={cue}
          presets={presets}
          isCurrentProject={isCurrentProject}
          expanded={expandedCueIds.has(cue.id)}
          onToggleExpand={() => toggleCueExpanded(cue.id)}
          onClick={() => handleRowClick(cue)}
          onApply={isCurrentProject ? () => handleApply(cue) : undefined}
          onEdit={isCurrentProject && cue.canEdit ? () => handleEdit(cue) : undefined}
          onDelete={isCurrentProject && cue.canDelete ? () => handleEdit(cue) : undefined}
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
        onDelete={editingCue?.canDelete ? handleDelete : undefined}
        isDeleting={isDeleting}
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

    </div>
  )
}

// Cue list row component
function CueListRow({
  cue,
  presets,
  isCurrentProject,
  expanded,
  onToggleExpand,
  onClick,
  onApply,
  onEdit,
  onDelete,
  onCopy,
  onDuplicate,
}: {
  cue: Cue
  presets?: FxPreset[]
  isCurrentProject: boolean
  expanded?: boolean
  onToggleExpand?: () => void
  onClick?: () => void
  onApply?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onCopy?: () => void
  onDuplicate?: () => void
}) {
  const presetCount = cue.presetApplications.length
  const adHocCount = cue.adHocEffects.length
  const hasExpandableContent = presetCount > 0 || adHocCount > 0

  return (
    <div className={cn(expanded && 'bg-accent/30')}>
      <div
        className={cn(
          'group flex items-center gap-2 rounded-md px-3 py-2.5 min-h-[44px] hover:bg-accent/50 transition-colors',
          onClick && 'cursor-pointer',
        )}
        onClick={onClick}
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
          <div className="font-medium text-sm truncate">{cue.name}</div>
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

        {/* Apply button for current project */}
        {isCurrentProject && onApply && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              onApply()
            }}
            title="Apply cue"
          >
            <Play className="size-4" />
          </Button>
        )}

        {/* Overflow menu */}
        {(onEdit || onDelete || onCopy || onDuplicate) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onApply && (
                <DropdownMenuItem onClick={onApply}>
                  <Play className="size-4 mr-2" />
                  Apply
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="size-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              )}
              {onDuplicate && (
                <DropdownMenuItem onClick={onDuplicate}>
                  <CopyPlus className="size-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
              )}
              {onCopy && (
                <DropdownMenuItem onClick={onCopy}>
                  <Copy className="size-4 mr-2" />
                  Copy to Project
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="size-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* ── Expanded content: preset applications and ad-hoc effects ── */}
      {expanded && hasExpandableContent && (
        <div className="px-3 pb-3 pt-1 space-y-2 ml-5">
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

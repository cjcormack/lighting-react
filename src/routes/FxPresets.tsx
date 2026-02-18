import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Loader2, Plus, Bookmark, Sun, Palette, Move, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import {
  useProjectPresetListQuery,
  useCreateProjectPresetMutation,
  useSaveProjectPresetMutation,
  useDeleteProjectPresetMutation,
} from '../store/fxPresets'
import { useFixtureListQuery } from '../store/fixtures'
import { PresetListRow } from '../components/presets/PresetListRow'
import { PresetForm } from '../components/presets/PresetForm'
import { CopyPresetDialog } from '../components/presets/CopyPresetDialog'
import {
  inferPresetCapabilities,
  buildFixtureTypeHierarchy,
  resolveFixtureTypeLabel,
} from '../api/fxPresetsApi'
import type { FxPreset, FxPresetInput, FixtureTypeHierarchy } from '../api/fxPresetsApi'
import { Breadcrumbs } from '../components/Breadcrumbs'

const CAPABILITY_CHIPS = [
  { value: 'dimmer', label: 'Dimmer', icon: Sun },
  { value: 'colour', label: 'Colour', icon: Palette },
  { value: 'position', label: 'Position', icon: Move },
] as const

// Redirect /presets → /projects/:projectId/presets
export function PresetsRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/presets`, { replace: true })
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

interface PresetGroup {
  key: string // fixtureType typeKey, or '' for untyped
  label: string
  presets: FxPreset[]
}

// Main presets management route
export function ProjectFxPresets() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const { data: presets, isLoading: presetsLoading } = useProjectPresetListQuery(projectIdNum)
  const { data: fixtureList } = useFixtureListQuery()

  const [createPreset, { isLoading: isCreating }] = useCreateProjectPresetMutation()
  const [savePreset, { isLoading: isSaving }] = useSaveProjectPresetMutation()
  const [deletePreset] = useDeleteProjectPresetMutation()

  const [formOpen, setFormOpen] = useState(false)
  const [editingPreset, setEditingPreset] = useState<FxPreset | null>(null)
  const [initialEditEffectIndex, setInitialEditEffectIndex] = useState<number | null>(null)
  const [deletingPreset, setDeletingPreset] = useState<FxPreset | null>(null)
  const [copyingPreset, setCopyingPreset] = useState<FxPreset | null>(null)

  // Filter state
  const [capabilityFilter, setCapabilityFilter] = useState<string[]>([])
  // Track collapsed groups (by group key)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  // Track expanded presets (showing effects inline)
  const [expandedPresetIds, setExpandedPresetIds] = useState<Set<number>>(new Set())

  const isCurrentProject = currentProject?.id === projectIdNum

  // Build hierarchy for label resolution
  const hierarchy = useMemo<FixtureTypeHierarchy | null>(() => {
    if (!fixtureList) return null
    return buildFixtureTypeHierarchy(fixtureList)
  }, [fixtureList])

  // Filtered presets (capability filter only — grouping replaces fixture type filter)
  const filteredPresets = useMemo(() => {
    if (!presets) return []
    if (capabilityFilter.length === 0) return presets
    return presets.filter((preset) => {
      const presetCaps = inferPresetCapabilities(preset.effects)
      return capabilityFilter.every((cap) => presetCaps.includes(cap))
    })
  }, [presets, capabilityFilter])

  // Group presets by fixture type
  const groups = useMemo<PresetGroup[]>(() => {
    const byType = new Map<string, FxPreset[]>()
    for (const preset of filteredPresets) {
      const key = preset.fixtureType ?? ''
      let list = byType.get(key)
      if (!list) {
        list = []
        byType.set(key, list)
      }
      list.push(preset)
    }

    const result: PresetGroup[] = []

    // "All Fixtures" group first
    const untyped = byType.get('')
    if (untyped) {
      result.push({ key: '', label: 'All Fixtures', presets: untyped })
      byType.delete('')
    }

    // Remaining groups sorted by label
    const typed = [...byType.entries()].map(([key, list]) => ({
      key,
      label: hierarchy ? resolveFixtureTypeLabel(key, hierarchy) : key,
      presets: list,
    }))
    typed.sort((a, b) => a.label.localeCompare(b.label))
    result.push(...typed)

    return result
  }, [filteredPresets, hierarchy])

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const togglePresetExpanded = (presetId: number) => {
    setExpandedPresetIds((prev) => {
      const next = new Set(prev)
      if (next.has(presetId)) {
        next.delete(presetId)
      } else {
        next.add(presetId)
      }
      return next
    })
  }

  const handleCreate = () => {
    setEditingPreset(null)
    setInitialEditEffectIndex(null)
    setFormOpen(true)
  }

  const handleEdit = (preset: FxPreset) => {
    setEditingPreset(preset)
    setInitialEditEffectIndex(null)
    setFormOpen(true)
  }

  const handleEditEffect = (preset: FxPreset, effectIndex: number) => {
    setEditingPreset(preset)
    setInitialEditEffectIndex(effectIndex)
    setFormOpen(true)
  }

  // Clicking a preset row: edit for current project, copy for other projects
  const handleRowClick = (preset: FxPreset) => {
    if (isCurrentProject && preset.canEdit) {
      handleEdit(preset)
    } else if (!isCurrentProject) {
      setCopyingPreset(preset)
    }
  }

  const handleSave = async (input: FxPresetInput) => {
    if (editingPreset) {
      await savePreset({
        projectId: projectIdNum,
        presetId: editingPreset.id,
        ...input,
      }).unwrap()
    } else {
      await createPreset({
        projectId: projectIdNum,
        ...input,
      }).unwrap()
    }
  }

  const handleDelete = async () => {
    if (!deletingPreset) return
    await deletePreset({
      projectId: projectIdNum,
      presetId: deletingPreset.id,
    }).unwrap()
    setDeletingPreset(null)
  }

  if (projectLoading || currentLoading || presetsLoading) {
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

  const totalFiltered = filteredPresets.length
  const totalAll = presets?.length ?? 0

  const presetListContent = totalAll === 0 ? (
    <Card className="p-8 text-center">
      <Bookmark className="size-10 mx-auto text-muted-foreground/30 mb-3" />
      <p className="text-sm text-muted-foreground">
        {isCurrentProject
          ? 'No presets yet. Create one to bundle multiple effects together.'
          : 'No presets in this project.'}
      </p>
      {isCurrentProject && (
        <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={handleCreate}>
          <Plus className="size-4" />
          Create Preset
        </Button>
      )}
    </Card>
  ) : totalFiltered === 0 ? (
    <div className="py-8 text-center text-sm text-muted-foreground">
      No presets match the current filters.
    </div>
  ) : (
    <div className="space-y-3">
      {groups.map((group) => {
        const isCollapsed = collapsedGroups.has(group.key)
        return (
          <div key={group.key} className="rounded-lg border">
            {groups.length > 1 && (
              <button
                onClick={() => toggleGroup(group.key)}
                className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-accent/50 transition-colors rounded-t-lg"
              >
                {isCollapsed ? (
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                )}
                <span className="text-sm font-medium">{group.label}</span>
                <span className="text-[11px] text-muted-foreground">
                  ({group.presets.length})
                </span>
              </button>
            )}
            {!isCollapsed && (
              <div
                className={cn(
                  'flex flex-col divide-y',
                  groups.length > 1 && 'border-t',
                )}
              >
                {group.presets.map((preset) => (
                  <PresetListRow
                    key={preset.id}
                    preset={preset}
                    expanded={expandedPresetIds.has(preset.id)}
                    onToggleExpand={() => togglePresetExpanded(preset.id)}
                    onClick={() => handleRowClick(preset)}
                    onEdit={isCurrentProject && preset.canEdit ? () => handleEdit(preset) : undefined}
                    onDelete={
                      isCurrentProject && preset.canDelete ? () => setDeletingPreset(preset) : undefined
                    }
                    onCopy={!isCurrentProject ? () => setCopyingPreset(preset) : undefined}
                    onEditEffect={
                      isCurrentProject && preset.canEdit
                        ? (effectIndex) => handleEditEffect(preset, effectIndex)
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 space-y-4">
        <Breadcrumbs projectName={project.name} currentPage="Presets" />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">FX Presets</h1>
            <p className="text-sm text-muted-foreground">
              {isCurrentProject
                ? 'Create and manage effect presets for quick application during busking.'
                : `Viewing presets for "${project.name}". Copy presets to your active project to use them.`}
            </p>
          </div>
          {isCurrentProject && (
            <Button onClick={handleCreate} size="sm" className="gap-1.5">
              <Plus className="size-4" />
              <span className="hidden sm:inline">New Preset</span>
            </Button>
          )}
        </div>

        {totalAll > 0 && (
          <ToggleGroup
            type="multiple"
            size="sm"
            value={capabilityFilter}
            onValueChange={setCapabilityFilter}
          >
            {CAPABILITY_CHIPS.map(({ value, label, icon: Icon }) => (
              <ToggleGroupItem key={value} value={value} className="gap-1 text-xs">
                <Icon className="size-3.5" />
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>

      {/* Content area — single column */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {presetListContent}

        {totalAll > 0 && capabilityFilter.length > 0 && (
          <p className="text-xs text-muted-foreground text-center mt-3">
            Showing {totalFiltered} of {totalAll} presets
          </p>
        )}
      </div>

      {/* Create/Edit form */}
      <PresetForm
        open={formOpen}
        onOpenChange={setFormOpen}
        preset={editingPreset}
        onSave={handleSave}
        isSaving={isCreating || isSaving}
        initialEditEffectIndex={initialEditEffectIndex}
      />

      {/* Delete confirmation */}
      <Dialog
        open={deletingPreset !== null}
        onOpenChange={(open: boolean) => !open && setDeletingPreset(null)}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete Preset</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingPreset?.name}&quot;? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingPreset(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy dialog */}
      {copyingPreset && (
        <CopyPresetDialog
          open={true}
          setOpen={(open) => {
            if (!open) setCopyingPreset(null)
          }}
          sourceProjectId={projectIdNum}
          presetId={copyingPreset.id}
          presetName={copyingPreset.name}
        />
      )}
    </div>
  )
}

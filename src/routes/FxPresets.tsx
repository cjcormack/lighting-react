import { useEffect, useState } from 'react'
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
import { Loader2, Plus, Bookmark } from 'lucide-react'
import { useCurrentProjectQuery, useProjectQuery } from '../store/projects'
import {
  useProjectPresetListQuery,
  useCreateProjectPresetMutation,
  useSaveProjectPresetMutation,
  useDeleteProjectPresetMutation,
} from '../store/fxPresets'
import { PresetCard } from '../components/presets/PresetCard'
import { PresetForm } from '../components/presets/PresetForm'
import { CopyPresetDialog } from '../components/presets/CopyPresetDialog'
import type { FxPreset, FxPresetInput } from '../api/fxPresetsApi'

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

// Main presets management route
export function ProjectFxPresets() {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const { data: presets, isLoading: presetsLoading } = useProjectPresetListQuery(projectIdNum)

  const [createPreset, { isLoading: isCreating }] = useCreateProjectPresetMutation()
  const [savePreset, { isLoading: isSaving }] = useSaveProjectPresetMutation()
  const [deletePreset] = useDeleteProjectPresetMutation()

  const [formOpen, setFormOpen] = useState(false)
  const [editingPreset, setEditingPreset] = useState<FxPreset | null>(null)
  const [deletingPreset, setDeletingPreset] = useState<FxPreset | null>(null)
  const [copyingPreset, setCopyingPreset] = useState<FxPreset | null>(null)

  const isCurrentProject = currentProject?.id === projectIdNum

  const handleCreate = () => {
    setEditingPreset(null)
    setFormOpen(true)
  }

  const handleEdit = (preset: FxPreset) => {
    setEditingPreset(preset)
    setFormOpen(true)
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

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
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

      {/* Preset grid */}
      {(presets?.length ?? 0) === 0 ? (
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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {presets?.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              onEdit={isCurrentProject && preset.canEdit ? () => handleEdit(preset) : undefined}
              onDelete={
                isCurrentProject && preset.canDelete ? () => setDeletingPreset(preset) : undefined
              }
              onCopy={!isCurrentProject ? () => setCopyingPreset(preset) : undefined}
            />
          ))}
        </div>
      )}

      {/* Create/Edit form */}
      <PresetForm
        open={formOpen}
        onOpenChange={setFormOpen}
        preset={editingPreset}
        onSave={handleSave}
        isSaving={isCreating || isSaving}
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

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import {
  useProjectQuery,
  useCurrentProjectQuery,
  useProjectScriptsQuery,
} from '../store/projects'
import type { ProjectScriptDetail } from '../api/projectApi'
import type { ScriptType } from '../store/scripts'
import {
  ScriptTypeSidebar,
  ScriptTypeMobileSheet,
  type ScriptTypeFilter,
} from '../components/scripts/ScriptTypePanel'
import { ScriptListContent } from '../components/scripts/ScriptListContent'
import { ScriptForm } from '../components/scripts/ScriptForm'
import { SCRIPT_TYPE_LABELS } from '../components/scripts/scriptUtils'

// Redirect component for /scripts route
export function ScriptsRedirect() {
  const { scriptId } = useParams()
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      const target = scriptId
        ? `/projects/${currentProject.id}/scripts/${scriptId}`
        : `/projects/${currentProject.id}/scripts`
      navigate(target, { replace: true })
    }
  }, [currentProject, isLoading, scriptId, navigate])

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return null
}

// Main ProjectScripts route component
export default function ProjectScripts() {
  const { projectId, scriptId } = useParams()
  const navigate = useNavigate()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const projectIdNum = Number(projectId)
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const { data: scriptList, isLoading: scriptsLoading } = useProjectScriptsQuery(projectIdNum)

  const isCurrentProject = project?.isCurrent === true

  // Filter state
  const [selectedFilter, setSelectedFilter] = useState<ScriptTypeFilter>('all')
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)

  // Form state
  const [formOpen, setFormOpen] = useState(false)
  const [editingScript, setEditingScript] = useState<ProjectScriptDetail | null>(null)

  // Compute type counts
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    scriptList?.forEach((s) => {
      counts[s.scriptType] = (counts[s.scriptType] ?? 0) + 1
    })
    return counts
  }, [scriptList])

  // Filter scripts
  const filteredScripts = useMemo(() => {
    if (!scriptList) return []
    if (selectedFilter === 'all') return scriptList
    return scriptList.filter((s) => s.scriptType === selectedFilter)
  }, [scriptList, selectedFilter])

  const selectedFilterLabel = selectedFilter === 'all'
    ? 'All Scripts'
    : SCRIPT_TYPE_LABELS[selectedFilter as ScriptType]

  // Backward compat: auto-open sheet if scriptId is in URL
  useEffect(() => {
    if (scriptId && scriptList && scriptList.length > 0) {
      const script = scriptList.find((s) => s.id === Number(scriptId))
      if (script) {
        setEditingScript(script)
        setFormOpen(true)
        // Clean up the URL to remove scriptId
        navigate(`/projects/${projectId}/scripts`, { replace: true })
      }
    }
  }, [scriptId, scriptList, navigate, projectId])

  const handleCreate = () => {
    setEditingScript(null)
    setFormOpen(true)
  }

  const handleSelect = (script: ProjectScriptDetail) => {
    setEditingScript(script)
    setFormOpen(true)
  }

  if (projectLoading || scriptsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-destructive">Project not found</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 space-y-4">
        <Breadcrumbs
          projectName={project.name}
          isActive={isCurrentProject}
          currentPage="Scripts"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">Scripts</h1>
            <p className="text-sm text-muted-foreground">
              {isCurrentProject
                ? 'Kotlin scripts for lighting automation, effects, and fixture control.'
                : `Viewing scripts for "${project.name}". Copy scripts to your active project to use them.`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isDesktop && (
              <ScriptTypeMobileSheet
                open={mobileSheetOpen}
                onOpenChange={setMobileSheetOpen}
                selectedFilter={selectedFilter}
                onSelectFilter={setSelectedFilter}
                typeCounts={typeCounts}
                totalCount={scriptList?.length ?? 0}
                selectedFilterLabel={selectedFilterLabel}
              />
            )}
            {isCurrentProject && (
              <Button onClick={handleCreate} size="sm" className="gap-1.5">
                <Plus className="size-4" />
                <span className="hidden sm:inline">New Script</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Two-pane layout */}
      <div className="flex-1 flex overflow-hidden">
        {isDesktop && (
          <ScriptTypeSidebar
            selectedFilter={selectedFilter}
            onSelectFilter={setSelectedFilter}
            typeCounts={typeCounts}
            totalCount={scriptList?.length ?? 0}
          />
        )}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
            <ScriptListContent
              scripts={filteredScripts}
              isCurrentProject={isCurrentProject}
              onSelect={handleSelect}
              onCreate={handleCreate}
            />
          </div>
        </div>
      </div>

      {/* Edit/Create sheet */}
      <ScriptForm
        open={formOpen}
        onOpenChange={setFormOpen}
        script={editingScript}
        projectId={projectIdNum}
        isCurrentProject={isCurrentProject}
      />
    </div>
  )
}

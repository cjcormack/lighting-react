import { Suspense, useEffect, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import {
  ChevronRight,
  Plus,
  Loader2,
  Menu,
  IterationCw,
  Braces,
  LayoutGrid,
  Repeat,
  Spotlight,
  Play,
} from "lucide-react"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ScriptEditor } from "@/components/scripts/ScriptEditor"
import {
  ScriptCompileDialog,
  ScriptRunDialog,
} from "@/components/scripts/ScriptResultDialogs"
import {
  useProjectQuery,
  useProjectScriptsQuery,
  useProjectScriptQuery,
  useCurrentProjectQuery,
  useCreateProjectScriptMutation,
  useCompileProjectScriptMutation,
  useRunProjectScriptMutation,
  useSaveProjectScriptMutation,
  useDeleteProjectScriptMutation,
} from "../store/projects"
import { ProjectScriptDetail } from "../api/projectApi"
import { Script, ScriptSetting } from "../store/scripts"
import CopyScriptDialog from "../CopyScriptDialog"

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
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  return null
}

// Main ProjectScripts route component
export default function ProjectScripts() {
  const { projectId, scriptId } = useParams()
  const navigate = useNavigate()
  const isMobile = useMediaQuery("(max-width: 767px)")
  const [drawerOpen, setDrawerOpen] = useState(false)

  const projectIdNum = Number(projectId)
  const { data: project, isLoading: projectLoading } = useProjectQuery(projectIdNum)
  const { data: scriptList, isLoading: scriptsLoading, isFetching: scriptsFetching } = useProjectScriptsQuery(projectIdNum)

  const isCurrentProject = project?.isCurrent === true

  // Auto-select first script if none selected
  // Wait until scripts are loaded and not fetching to avoid stale data from previous project
  useEffect(() => {
    if (scriptId === undefined && scriptList && scriptList.length > 0 && !scriptsLoading && !scriptsFetching) {
      navigate(`/projects/${projectId}/scripts/${scriptList[0].id}`, { replace: true })
    }
  }, [scriptId, scriptList, projectId, navigate, scriptsLoading, scriptsFetching])

  if (projectLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }

  if (!project) {
    return (
      <Card className="m-4 p-4">
        <p className="text-destructive">Project not found</p>
      </Card>
    )
  }

  return (
    <Card className="m-4 p-4 flex flex-col min-w-0">
      {/* Header with breadcrumbs */}
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
        <Breadcrumbs projectName={project.name} isCurrent={isCurrentProject} />
      </div>

      {/* Main content */}
      <div className="flex gap-0 min-w-0">
        {isMobile ? (
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="p-4 border-b">
                <SheetTitle>Scripts</SheetTitle>
              </SheetHeader>
              <div className="overflow-y-auto flex-1">
                <Suspense fallback={<div className="p-4">Loading...</div>}>
                  <ScriptList
                    projectId={projectIdNum}
                    isCurrentProject={isCurrentProject}
                    onSelect={() => setDrawerOpen(false)}
                  />
                </Suspense>
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <div className="w-52">
            <Suspense fallback={<div>Loading...</div>}>
              <ScriptList
                projectId={projectIdNum}
                isCurrentProject={isCurrentProject}
              />
            </Suspense>
          </div>
        )}
        <div className="flex-1 min-w-0">
          {scriptId === undefined ? (
            <></>
          ) : scriptId === "new" && isCurrentProject ? (
            <NewProjectScript projectId={projectIdNum} />
          ) : (
            <Suspense fallback={<div>Loading...</div>}>
              <ScriptDetailView
                projectId={projectIdNum}
                scriptId={Number(scriptId)}
                isCurrentProject={isCurrentProject}
              />
            </Suspense>
          )}
        </div>
      </div>
    </Card>
  )
}

// Breadcrumbs component
function Breadcrumbs({
  projectName,
  isCurrent,
  isReadOnly,
}: {
  projectName: string
  isCurrent: boolean
  isReadOnly?: boolean
}) {
  const navigate = useNavigate()

  // Show read-only badge if explicitly set, or if viewing non-current project
  const showReadOnlyBadge = isReadOnly ?? !isCurrent

  return (
    <nav className="flex items-center gap-1 text-sm flex-wrap">
      <button
        onClick={() => navigate("/projects")}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        Projects
      </button>
      <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />
      <button
        onClick={() => navigate("/projects")}
        className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
      >
        {projectName}
        <Badge variant={isCurrent ? "default" : "outline"} className="text-xs">
          {isCurrent ? "active" : "inactive"}
        </Badge>
      </button>
      <ChevronRight className="size-4 text-muted-foreground flex-shrink-0" />
      <span className="font-medium flex items-center gap-2">
        Scripts
        {showReadOnlyBadge && (
          <Badge variant="secondary" className="text-xs">
            Read-only
          </Badge>
        )}
      </span>
    </nav>
  )
}

// Script list component
interface ScriptListProps {
  projectId: number
  isCurrentProject: boolean
  onSelect?: () => void
}

function ScriptList({ projectId, isCurrentProject, onSelect }: ScriptListProps) {
  const navigate = useNavigate()

  const { data: scriptList, isLoading, isFetching } = useProjectScriptsQuery(projectId)

  const doNew = () => {
    navigate(`/projects/${projectId}/scripts/new`)
    onSelect?.()
  }

  // Show loading when initially loading OR when refetching (e.g., switching projects)
  if (isLoading || isFetching) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  if (!scriptList || scriptList.length === 0) {
    return (
      <div className="p-4 text-muted-foreground text-sm">
        No scripts in this project.
        {isCurrentProject && (
          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={doNew}>
              <Plus className="size-4" />
              New Script
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {scriptList.map((script) => (
        <ScriptListEntry
          key={script.id}
          scriptId={script.id}
          projectId={projectId}
          isCurrentProject={isCurrentProject}
          onSelect={onSelect}
        />
      ))}
      {isCurrentProject && (
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
      )}
    </div>
  )
}

// Script list entry component
interface ScriptListEntryProps {
  scriptId: number
  projectId: number
  isCurrentProject: boolean
  onSelect?: () => void
}

// Determine the most prominent usage of a script for display
type ScriptUsage = {
  icon: React.ReactNode
  tooltip: string
}

const getScriptUsage = (script: Script): ScriptUsage => {
  // Priority: Project properties > Scenes > Chases > Unmapped
  if (script.usedByProperties.length > 0) {
    if (script.usedByProperties.includes("loadFixturesScript")) {
      return { icon: <LayoutGrid className="size-4" />, tooltip: "Load Fixtures Script" }
    }
    if (script.usedByProperties.includes("trackChangedScript")) {
      return { icon: <Play className="size-4" />, tooltip: "Track Changed Script" }
    }
    if (script.usedByProperties.includes("runLoopScript")) {
      return { icon: <Repeat className="size-4" />, tooltip: "Run Loop Script" }
    }
  }

  if (script.sceneNames.length > 0) {
    const count = script.sceneNames.length
    return {
      icon: <Spotlight className="size-4" />,
      tooltip: count === 1 ? `Used by scene: ${script.sceneNames[0]}` : `Used by ${count} scenes`,
    }
  }

  if (script.chaseNames.length > 0) {
    const count = script.chaseNames.length
    return {
      icon: <IterationCw className="size-4" />,
      tooltip: count === 1 ? `Used by chase: ${script.chaseNames[0]}` : `Used by ${count} chases`,
    }
  }

  return { icon: <Braces className="size-4" />, tooltip: "Not used" }
}

// Helper for scripts that only have scene/chase names (from other projects)
const getScriptUsageFromNames = (sceneNames: string[], chaseNames: string[]): ScriptUsage => {
  if (sceneNames.length > 0) {
    const count = sceneNames.length
    return {
      icon: <Spotlight className="size-4" />,
      tooltip: count === 1 ? `Used by scene: ${sceneNames[0]}` : `Used by ${count} scenes`,
    }
  }

  if (chaseNames.length > 0) {
    const count = chaseNames.length
    return {
      icon: <IterationCw className="size-4" />,
      tooltip: count === 1 ? `Used by chase: ${chaseNames[0]}` : `Used by ${count} chases`,
    }
  }

  return { icon: <Braces className="size-4" />, tooltip: "Not used" }
}

function ScriptListEntry({
  scriptId,
  projectId,
  isCurrentProject,
  onSelect,
}: ScriptListEntryProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const { data: script, isLoading } = useProjectScriptQuery({ projectId, scriptId })

  if (isLoading) {
    return <div className="px-4 py-2 text-sm text-muted-foreground">Loading...</div>
  }

  if (!script) {
    return null
  }

  const isSelected = location.pathname === `/projects/${projectId}/scripts/${scriptId}`

  // Get usage info (now available for all projects)
  const usage = "usedByProperties" in script && script.usedByProperties
    ? getScriptUsage(script as Script)
    : "sceneNames" in script && (script.sceneNames?.length ?? 0) > 0
      ? getScriptUsageFromNames(script.sceneNames!, script.chaseNames ?? [])
      : "chaseNames" in script && (script.chaseNames?.length ?? 0) > 0
        ? getScriptUsageFromNames([], script.chaseNames!)
        : { icon: <Braces className="size-4" />, tooltip: "Not used" }

  const handleClick = () => {
    navigate(`/projects/${projectId}/scripts/${scriptId}`)
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
      <TooltipContent side="right">{usage.tooltip}</TooltipContent>
    </Tooltip>
  )
}

// New script component (for current project only)
function NewProjectScript({ projectId }: { projectId: number }) {
  const navigate = useNavigate()
  const [runCreateMutation, { isLoading: isCreating }] = useCreateProjectScriptMutation()

  const [name, setName] = useState("")
  const [scriptCode, setScriptCode] = useState("")
  const [settings, setSettings] = useState<ScriptSetting[]>([])

  const handleCreate = async () => {
    try {
      const result = await runCreateMutation({
        projectId,
        name,
        script: scriptCode,
        settings,
      }).unwrap()
      navigate(`/projects/${projectId}/scripts/${result.id}`)
    } catch {
      // Error handling could be improved
    }
  }

  const script = { name, script: scriptCode, settings }
  const canCreate = name !== "" && scriptCode !== ""

  return (
    <ScriptEditor
      script={script}
      id="new"
      onNameChange={setName}
      onScriptChange={setScriptCode}
      onAddSetting={(setting) => setSettings([...settings.filter(s => s.name !== setting.name), setting])}
      onRemoveSetting={(setting) => setSettings(settings.filter(s => s.name !== setting.name))}
      footerActions={
        <Button disabled={!canCreate || isCreating} onClick={handleCreate}>
          {isCreating ? "Creating..." : "Create"}
        </Button>
      }
    />
  )
}

// Script detail view - decides between editable and read-only based on canEdit
function ScriptDetailView({
  projectId,
  scriptId,
  isCurrentProject,
}: {
  projectId: number
  scriptId: number
  isCurrentProject: boolean
}) {
  const navigate = useNavigate()
  const { data: script, isLoading, isFetching } = useProjectScriptQuery({ projectId, scriptId })

  if (isLoading || isFetching) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  if (!script) {
    return <p className="p-4 text-destructive">Script not found.</p>
  }

  // Use canEdit from backend, default to isCurrentProject for backwards compatibility
  const canEdit = script.canEdit ?? isCurrentProject

  if (!isCurrentProject) {
    // Non-current project: always show view mode with Copy button
    return <ViewProjectScript projectId={projectId} scriptId={scriptId} />
  }

  if (!canEdit) {
    // Current project but canEdit is false: show read-only without Copy button
    return <ReadOnlyScriptView script={script} />
  }

  // Current project with canEdit true: show editable
  return (
    <EditableScriptEditor
      script={script}
      projectId={projectId}
      onNavigate={(path) => navigate(path)}
    />
  )
}

// Read-only script view for current project when canEdit is false
function ReadOnlyScriptView({
  script,
}: {
  script: ProjectScriptDetail
}) {
  return (
    <ScriptEditor
      script={script}
      id={script.id}
      readOnly
    />
  )
}

// Edit script component (for current project) - kept for backwards compatibility
function EditProjectScript({
  projectId,
  scriptId,
}: {
  projectId: number
  scriptId: number
}) {
  const navigate = useNavigate()
  const { data: script, isLoading, isFetching } = useProjectScriptQuery({ projectId, scriptId })

  if (isLoading || isFetching) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  if (!script) {
    return <p className="p-4 text-destructive">Script not found.</p>
  }

  return (
    <EditableScriptEditor
      script={script}
      projectId={projectId}
      onNavigate={(path) => navigate(path)}
    />
  )
}

// Editable script editor with full mutation support
function EditableScriptEditor({
  script,
  projectId,
  onNavigate,
}: {
  script: ProjectScriptDetail
  projectId: number
  onNavigate: (path: string) => void
}) {
  const [
    runCompileMutation,
    {
      data: compileResult,
      isUninitialized: hasNotCompiled,
      isLoading: isCompiling,
      reset: resetCompile,
    },
  ] = useCompileProjectScriptMutation()
  const [
    runRunMutation,
    {
      data: runResult,
      isUninitialized: hasNotRun,
      isLoading: isRunning,
      reset: resetRun,
    },
  ] = useRunProjectScriptMutation()
  const [runSaveMutation, { isLoading: isSaving }] = useSaveProjectScriptMutation()
  const [runDeleteMutation] = useDeleteProjectScriptMutation()

  const [edits, setEdits] = useState<{
    name?: string
    script?: string
    settings?: ScriptSetting[]
  }>({})

  // Reset edits when script changes
  useEffect(() => {
    setEdits({})
  }, [script.id])

  const currentName = edits.name ?? script.name
  const currentScript = edits.script ?? script.script
  const currentSettings = edits.settings ?? script.settings

  const hasChanged =
    edits.name !== undefined ||
    edits.script !== undefined ||
    edits.settings !== undefined

  const canSave = hasChanged && currentName !== "" && currentScript !== ""
  const canReset = hasChanged
  const canCompile = currentScript !== ""
  const canRun = currentScript !== ""

  const handleCompile = () => {
    runCompileMutation({ projectId, script: currentScript, settings: currentSettings })
  }

  const handleRun = () => {
    runRunMutation({ projectId, script: currentScript, settings: currentSettings })
  }

  const handleSave = async () => {
    await runSaveMutation({
      projectId,
      scriptId: script.id,
      name: currentName,
      script: currentScript,
      settings: currentSettings,
    })
    setEdits({})
  }

  const handleReset = () => {
    setEdits({})
  }

  const handleDelete = async () => {
    if (confirm(`Delete "${script.name}"?`)) {
      await runDeleteMutation({ projectId, scriptId: script.id })
      onNavigate(`/projects/${projectId}/scripts`)
    }
  }

  const editableScript = {
    name: currentName,
    script: currentScript,
    settings: currentSettings,
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
      <ScriptEditor
        script={editableScript}
        id={script.id}
        onNameChange={(name) => setEdits({ ...edits, name: name !== script.name ? name : undefined })}
        onScriptChange={(code) => {
          const normalized = code.trim()
          const original = script.script.trim()
          setEdits({ ...edits, script: normalized !== original ? code : undefined })
        }}
        onAddSetting={(setting) => {
          const newSettings = [...currentSettings.filter(s => s.name !== setting.name), setting]
          setEdits({ ...edits, settings: newSettings })
        }}
        onRemoveSetting={(setting) => {
          const newSettings = currentSettings.filter(s => s.name !== setting.name)
          setEdits({ ...edits, settings: newSettings })
        }}
        onCompile={handleCompile}
        onRun={handleRun}
        isCompiling={isCompiling}
        isRunning={isRunning}
        footerActions={
          <>
            <Button
              variant="destructive"
              disabled={script.canDelete === false}
              onClick={handleDelete}
            >
              Delete
            </Button>
            <Button variant="secondary" disabled={!canReset} onClick={handleReset}>
              Reset
            </Button>
            <Button disabled={!canSave || isSaving} onClick={handleSave}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </>
        }
      />
    </>
  )
}

// View script component (read-only for non-current projects)
function ViewProjectScript({
  projectId,
  scriptId,
}: {
  projectId: number
  scriptId: number
}) {
  const [copyDialogOpen, setCopyDialogOpen] = useState(false)
  const { data: script, isLoading } = useProjectScriptQuery({ projectId, scriptId })

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  if (!script) {
    return <p className="p-4 text-destructive">Script not found.</p>
  }

  return (
    <>
      <CopyScriptDialog
        open={copyDialogOpen}
        setOpen={setCopyDialogOpen}
        sourceProjectId={projectId}
        scriptId={scriptId}
        scriptName={script.name}
      />
      <ScriptEditor
        script={script}
        id={`${projectId}-${scriptId}`}
        readOnly
        headerActions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCopyDialogOpen(true)}
          >
            Copy to Project
          </Button>
        }
      />
    </>
  )
}

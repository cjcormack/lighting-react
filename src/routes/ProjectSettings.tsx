import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Loader2 } from "lucide-react"
import { useCurrentProjectQuery, useProjectQuery, useUpdateProjectMutation } from "@/store/projects"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { formatError } from "@/lib/formatError"
import { PatchListContent } from "./Patches"
import { SurfacesContent } from "./Surfaces"

const TABS = ["general", "patches", "surfaces"] as const
type Tab = (typeof TABS)[number]

function isTab(value: string | undefined): value is Tab {
  return TABS.includes(value as Tab)
}

export function ProjectSettingsRedirect() {
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && currentProject) {
      navigate(`/projects/${currentProject.id}/settings`, { replace: true })
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

export function ProjectSettings() {
  const { projectId, tab } = useParams()
  const navigate = useNavigate()
  const projectIdNum = Number(projectId)
  const { data: project, isLoading } = useProjectQuery(projectIdNum)

  const activeTab: Tab = isTab(tab) ? tab : "general"

  if (isLoading) {
    return (
      <Card className="m-4 p-4 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin" />
      </Card>
    )
  }
  if (!project) {
    return <Card className="m-4 p-4"><p className="text-destructive">Project not found</p></Card>
  }

  const handleTabChange = (value: string) => {
    const next = isTab(value) ? value : "general"
    const path = next === "general"
      ? `/projects/${projectIdNum}/settings`
      : `/projects/${projectIdNum}/settings/${next}`
    navigate(path, { replace: true })
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-4 space-y-3 border-b">
        <Breadcrumbs projectName={project.name} currentPage="Settings" />
        <div>
          <h1 className="text-lg font-semibold">Project Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure this project&rsquo;s metadata, fixture patches, and control surfaces.
          </p>
        </div>
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="patches">Patch List</TabsTrigger>
            <TabsTrigger value="surfaces">Surfaces</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === "general" && (
          <GeneralTab projectId={projectIdNum} />
        )}
        {activeTab === "patches" && <PatchListContent projectId={projectIdNum} />}
        {activeTab === "surfaces" && <SurfacesContent projectId={projectIdNum} />}
      </div>
    </div>
  )
}

function GeneralTab({ projectId }: { projectId: number }) {
  const { data: project } = useProjectQuery(projectId)
  const [updateProject, { isLoading: isUpdating }] = useUpdateProjectMutation()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  // Seed once per project identity. Depending on the whole `project` object
  // would clobber in-progress edits whenever the cache refreshes.
  useEffect(() => {
    if (project) {
      setName(project.name)
      setDescription(project.description || "")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  if (!project) {
    return (
      <div className="p-4 flex justify-center">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  const trimmedName = name.trim()
  const dirty =
    trimmedName !== project.name || (description || "") !== (project.description || "")
  const isValid = trimmedName.length > 0

  const handleSave = async () => {
    if (!isValid) return
    try {
      await updateProject({
        id: projectId,
        name: trimmedName,
        description: description || null,
      }).unwrap()
      toast.success("Project saved")
    } catch (err) {
      toast.error(`Failed to save project: ${formatError(err)}`)
    }
  }

  return (
    <div className="p-4 max-w-2xl">
      <Card className="p-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="project-name">Project name *</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="project-desc">Description</Label>
          <Textarea
            id="project-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!dirty || !isValid || isUpdating}>
            {isUpdating ? "Saving…" : "Save"}
          </Button>
        </div>
      </Card>
    </div>
  )
}

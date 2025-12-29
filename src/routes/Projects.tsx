import { useState } from "react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { PlusCircle, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  useProjectListQuery,
  useCurrentProjectQuery,
  useDeleteProjectMutation,
  useSetCurrentProjectMutation,
} from "../store/projects"
import { ProjectSummary } from "../api/projectApi"
import CreateProjectDialog from "../CreateProjectDialog"
import EditProjectDialog from "../EditProjectDialog"
import DeleteProjectConfirmDialog from "../DeleteProjectConfirmDialog"
import ProjectSwitchConfirmDialog from "../ProjectSwitchConfirmDialog"
import ViewProjectScriptsDialog from "../ViewProjectScriptsDialog"
import CloneProjectDialog from "../CloneProjectDialog"

export default function Projects() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  return (
    <>
      <CreateProjectDialog
        open={createDialogOpen}
        setOpen={setCreateDialogOpen}
      />
      <Card className="m-4 p-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Projects</h1>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <PlusCircle className="size-4" />
            Create Project
          </Button>
        </div>
        <ProjectsContainer />
      </Card>
    </>
  )
}

function ProjectsContainer() {
  const { data: projects, isLoading, error } = useProjectListQuery()

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <XCircle className="size-4" />
        <AlertDescription>Failed to load projects</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects?.map(project => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  )
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)
  const [scriptsOpen, setScriptsOpen] = useState(false)
  const [cloneOpen, setCloneOpen] = useState(false)

  const { data: currentProject } = useCurrentProjectQuery()

  const [deleteProject, { isLoading: isDeleting, error: deleteError }] =
    useDeleteProjectMutation()
  const [setCurrentProject, { isLoading: isSwitching }] =
    useSetCurrentProjectMutation()

  const handleActivate = () => {
    if (!project.isCurrent) {
      setSwitchOpen(true)
    }
  }

  const handleConfirmSwitch = async () => {
    await setCurrentProject(project.id)
    setSwitchOpen(false)
  }

  const handleDelete = async () => {
    try {
      await deleteProject(project.id).unwrap()
      setDeleteOpen(false)
    } catch {
      // Error handled by dialog
    }
  }

  const is409Error =
    deleteError && "status" in deleteError && deleteError.status === 409

  return (
    <>
      <EditProjectDialog
        open={editOpen}
        setOpen={setEditOpen}
        projectId={project.id}
      />
      <DeleteProjectConfirmDialog
        open={deleteOpen}
        projectName={project.name}
        isCurrent={project.isCurrent}
        isDeleting={isDeleting}
        error={
          is409Error ? "Cannot delete the currently active project" : undefined
        }
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
      <ProjectSwitchConfirmDialog
        open={switchOpen}
        currentProjectName={currentProject?.name || ""}
        newProjectName={project.name}
        isSwitching={isSwitching}
        onConfirm={handleConfirmSwitch}
        onCancel={() => setSwitchOpen(false)}
      />
      <ViewProjectScriptsDialog
        open={scriptsOpen}
        setOpen={setScriptsOpen}
        projectId={project.id}
        projectName={project.name}
      />
      <CloneProjectDialog
        open={cloneOpen}
        setOpen={setCloneOpen}
        sourceProjectId={project.id}
        sourceProjectName={project.name}
      />
      <Card className={cn(project.isCurrent && "bg-blue-50 dark:bg-blue-950")}>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{project.name}</CardTitle>
            {project.isCurrent && <Badge>Active</Badge>}
          </div>
        </CardHeader>
        <CardContent className="pb-2">
          {project.description && (
            <p className="text-sm text-muted-foreground">
              {project.description}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          {!project.isCurrent && (
            <Button variant="outline" size="sm" onClick={handleActivate}>
              Activate
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setScriptsOpen(true)}
          >
            Scripts
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
            Configure
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCloneOpen(true)}>
            Clone
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={project.isCurrent}
          >
            Delete
          </Button>
        </CardFooter>
      </Card>
    </>
  )
}

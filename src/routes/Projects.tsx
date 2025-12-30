import { useState } from "react"
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreVertical, PlusCircle, XCircle } from "lucide-react"
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
      <Card
        className={cn(
          "flex flex-col gap-0 py-3",
          project.isCurrent && "bg-blue-100 dark:bg-blue-900"
        )}
      >
        <CardHeader className="p-0 px-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-lg">{project.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {project.description || "\u00A0"}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="-mr-2 -mt-1">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                {!project.isCurrent && (
                  <DropdownMenuItem onClick={handleActivate}>
                    Activate
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setScriptsOpen(true)}>
                  Scripts
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  Configure
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCloneOpen(true)}>
                  Clone
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                  disabled={project.isCurrent}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardFooter className="p-0 px-3 mt-auto">
          <Badge variant={project.isCurrent ? "default" : "outline"}>
            {project.isCurrent ? "active" : "inactive"}
          </Badge>
        </CardFooter>
      </Card>
    </>
  )
}

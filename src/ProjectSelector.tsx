import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Settings, List, Loader2 } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useCurrentProjectQuery } from "./store/projects"
import EditProjectDialog from "./EditProjectDialog"

interface ProjectSelectorProps {
  collapsed?: boolean
}

export default function ProjectSelector({ collapsed }: ProjectSelectorProps) {
  const navigate = useNavigate()
  const { data: currentProject, isLoading } = useCurrentProjectQuery()
  const [editOpen, setEditOpen] = useState(false)

  const handleManageProjects = () => {
    navigate("/projects")
  }

  const handleConfigureProject = () => {
    if (currentProject) {
      setEditOpen(true)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  if (collapsed) {
    return (
      <TooltipProvider>
        <div className="flex flex-col items-center gap-1 p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleConfigureProject}
                disabled={!currentProject}
              >
                <Settings className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              Configure: {currentProject?.name || "Project"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleManageProjects}>
                <List className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">All Projects</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      {currentProject && (
        <EditProjectDialog
          open={editOpen}
          setOpen={setEditOpen}
          projectId={currentProject.id}
        />
      )}
      <div className="py-2">
        <div className="px-4 pb-1 text-xs font-medium text-muted-foreground">
          Project
        </div>
        <div className="flex items-center gap-1 px-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="flex-1 min-w-0 truncate text-left text-sm hover:underline"
                onClick={handleConfigureProject}
              >
                {currentProject?.name || "No project"}
              </button>
            </TooltipTrigger>
            <TooltipContent>Configure current project</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleConfigureProject}
                disabled={!currentProject}
              >
                <Settings className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Configure current project</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleManageProjects}
              >
                <List className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>All projects</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}

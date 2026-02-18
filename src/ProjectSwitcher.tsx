import { useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Settings,
  List,
  Loader2,
  Braces,
  Spotlight,
  IterationCw,
  LayoutGrid,
  Layers,
  SlidersHorizontal,
  ChevronDown,
  FolderOpen,
  AudioWaveform,
  Bookmark,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useProjectListQuery } from "./store/projects"
import { useGetUniverseQuery } from "./store/universes"
import EditProjectDialog from "./EditProjectDialog"

interface ProjectSwitcherProps {
  collapsed?: boolean
}

export default function ProjectSwitcher({ collapsed }: ProjectSwitcherProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const { data: projects, isLoading: projectsLoading } = useProjectListQuery()
  const { data: universes } = useGetUniverseQuery()

  const [editProjectId, setEditProjectId] = useState<number | null>(null)

  if (projectsLoading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  const activeProject = projects?.find((p) => p.isCurrent)
  const viewedProjectId = params.projectId ? parseInt(params.projectId) : activeProject?.id
  const viewedProject = projects?.find((p) => p.id === viewedProjectId) ?? activeProject
  const isViewingActiveProject = viewedProject?.id === activeProject?.id

  // Collapsed view - just show icons for nav items
  if (collapsed) {
    return (
      <div className="flex flex-col gap-1 px-2">
        {viewedProject && (
          <>
            {/* Project dropdown trigger (collapsed) */}
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-full"
                    >
                      <FolderOpen className="size-5" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="right">{viewedProject.name}</TooltipContent>
              </Tooltip>
              <ProjectDropdownContent
                projects={projects ?? []}
                activeProjectId={activeProject?.id}
                viewedProjectId={viewedProject.id}
                onSelect={(id) => navigate(`/projects/${id}`)}
                onManage={() => navigate("/projects")}
              />
            </DropdownMenu>

            {/* Configure button */}
            <NavItem
              icon={<Settings className="size-5" />}
              label="Configure"
              isActive={false}
              collapsed
              onClick={() => setEditProjectId(viewedProject.id)}
            />

            {/* Navigation items */}
            <NavItem
              icon={<Braces className="size-5" />}
              label="Scripts"
              isActive={location.pathname.includes("/scripts")}
              collapsed
              onClick={() => navigate(`/projects/${viewedProject.id}/scripts`)}
            />
            <NavItem
              icon={<Spotlight className="size-5" />}
              label="Scenes"
              isActive={location.pathname.includes("/scenes")}
              collapsed
              onClick={() => navigate(`/projects/${viewedProject.id}/scenes`)}
            />
            <NavItem
              icon={<IterationCw className="size-5" />}
              label="Chases"
              isActive={location.pathname.includes("/chases")}
              collapsed
              onClick={() => navigate(`/projects/${viewedProject.id}/chases`)}
            />

            {/* Hardware items - only for active project */}
            {isViewingActiveProject && (
              <>
                <NavItem
                  icon={<LayoutGrid className="size-5" />}
                  label="Fixtures"
                  isActive={location.pathname.includes("/fixtures")}
                  collapsed
                  onClick={() => navigate(`/projects/${viewedProject.id}/fixtures`)}
                />
                <NavItem
                  icon={<Layers className="size-5" />}
                  label="Groups"
                  isActive={location.pathname.includes("/groups")}
                  collapsed
                  onClick={() => navigate(`/projects/${viewedProject.id}/groups`)}
                />
                <NavItem
                  icon={<AudioWaveform className="size-5" />}
                  label="FX"
                  isActive={location.pathname.includes("/fx")}
                  collapsed
                  onClick={() => navigate(`/projects/${viewedProject.id}/fx`)}
                />
                <NavItem
                  icon={<Bookmark className="size-5" />}
                  label="FX Presets"
                  isActive={location.pathname.includes("/presets")}
                  collapsed
                  onClick={() => navigate(`/projects/${viewedProject.id}/presets`)}
                />
                {(universes ?? []).map((universe) => (
                  <NavItem
                    key={universe}
                    icon={<SlidersHorizontal className="size-5" />}
                    label={`Universe ${universe}`}
                    isActive={location.pathname === `/projects/${viewedProject.id}/channels/${universe}`}
                    collapsed
                    onClick={() => navigate(`/projects/${viewedProject.id}/channels/${universe}`)}
                  />
                ))}
              </>
            )}
          </>
        )}

        {/* Edit dialog */}
        {editProjectId !== null && (
          <EditProjectDialog
            open={true}
            setOpen={(open) => !open && setEditProjectId(null)}
            projectId={editProjectId}
          />
        )}
      </div>
    )
  }

  // Expanded view
  return (
    <div className="flex flex-col h-full">
      {viewedProject && (
        <>
          {/* Project header with dropdown */}
          <div className="px-2 mb-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between px-3 h-9"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{viewedProject.name}</span>
                    {!isViewingActiveProject && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <ChevronDown className="size-4 text-muted-foreground flex-shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <ProjectDropdownContent
                projects={projects ?? []}
                activeProjectId={activeProject?.id}
                viewedProjectId={viewedProject.id}
                onSelect={(id) => navigate(`/projects/${id}`)}
                onManage={() => navigate("/projects")}
              />
            </DropdownMenu>
          </div>

          {/* Navigation items */}
          <div className="flex-1 px-2 space-y-0.5">
            <NavItem
              icon={<Braces className="size-4" />}
              label="Scripts"
              isActive={location.pathname.includes("/scripts")}
              collapsed={false}
              onClick={() => navigate(`/projects/${viewedProject.id}/scripts`)}
            />
            <NavItem
              icon={<Spotlight className="size-4" />}
              label="Scenes"
              isActive={location.pathname.includes("/scenes")}
              collapsed={false}
              onClick={() => navigate(`/projects/${viewedProject.id}/scenes`)}
            />
            <NavItem
              icon={<IterationCw className="size-4" />}
              label="Chases"
              isActive={location.pathname.includes("/chases")}
              collapsed={false}
              onClick={() => navigate(`/projects/${viewedProject.id}/chases`)}
            />

            {/* Hardware items - only for active project */}
            {isViewingActiveProject && (
              <>
                <NavItem
                  icon={<LayoutGrid className="size-4" />}
                  label="Fixtures"
                  isActive={location.pathname.includes("/fixtures")}
                  collapsed={false}
                  onClick={() => navigate(`/projects/${viewedProject.id}/fixtures`)}
                />
                <NavItem
                  icon={<Layers className="size-4" />}
                  label="Groups"
                  isActive={location.pathname.includes("/groups")}
                  collapsed={false}
                  onClick={() => navigate(`/projects/${viewedProject.id}/groups`)}
                />
                <NavItem
                  icon={<AudioWaveform className="size-4" />}
                  label="FX"
                  isActive={location.pathname.includes("/fx")}
                  collapsed={false}
                  onClick={() => navigate(`/projects/${viewedProject.id}/fx`)}
                />
                <NavItem
                  icon={<Bookmark className="size-4" />}
                  label="FX Presets"
                  isActive={location.pathname.includes("/presets")}
                  collapsed={false}
                  onClick={() => navigate(`/projects/${viewedProject.id}/presets`)}
                />
                {(universes ?? []).map((universe) => (
                  <NavItem
                    key={universe}
                    icon={<SlidersHorizontal className="size-4" />}
                    label={`Universe ${universe}`}
                    isActive={location.pathname === `/projects/${viewedProject.id}/channels/${universe}`}
                    collapsed={false}
                    onClick={() => navigate(`/projects/${viewedProject.id}/channels/${universe}`)}
                  />
                ))}
              </>
            )}
          </div>

          {/* Configure at bottom */}
          <div className="px-2 pt-2 mt-auto border-t">
            <NavItem
              icon={<Settings className="size-4" />}
              label="Configure Project"
              isActive={false}
              collapsed={false}
              onClick={() => setEditProjectId(viewedProject.id)}
              muted
            />
          </div>
        </>
      )}

      {/* Edit dialog */}
      {editProjectId !== null && (
        <EditProjectDialog
          open={true}
          setOpen={(open) => !open && setEditProjectId(null)}
          projectId={editProjectId}
        />
      )}
    </div>
  )
}

// Dropdown content showing all projects
function ProjectDropdownContent({
  projects,
  activeProjectId,
  viewedProjectId,
  onSelect,
  onManage,
}: {
  projects: { id: number; name: string; isCurrent: boolean }[]
  activeProjectId: number | undefined
  viewedProjectId: number
  onSelect: (id: number) => void
  onManage: () => void
}) {
  return (
    <DropdownMenuContent align="start" className="w-56">
      {projects.map((project) => (
        <DropdownMenuItem
          key={project.id}
          onClick={() => onSelect(project.id)}
          className={cn(
            "flex items-center justify-between",
            project.id === viewedProjectId && "bg-accent"
          )}
        >
          <span className="truncate">{project.name}</span>
          {project.id === activeProjectId && (
            <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
              Active
            </Badge>
          )}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onManage}>
        <List className="size-4 mr-2" />
        Manage Projects
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}

// Reusable nav item component
interface NavItemProps {
  icon: React.ReactNode
  label: string
  isActive: boolean
  collapsed: boolean
  onClick: () => void
  muted?: boolean
}

function NavItem({ icon, label, isActive, collapsed, onClick, muted }: NavItemProps) {
  const button = (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        isActive && "bg-accent text-accent-foreground",
        collapsed && "justify-center px-2",
        muted && "text-muted-foreground"
      )}
    >
      <span className="flex-shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    )
  }

  return button
}

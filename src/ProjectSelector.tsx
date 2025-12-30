import { useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
  ChevronRight,
  Circle,
  Home,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useProjectListQuery, useCurrentProjectQuery } from "./store/projects"
import { useGetUniverseQuery } from "./store/universes"
import EditProjectDialog from "./EditProjectDialog"
import { ProjectSummary } from "./api/projectApi"

interface ProjectSelectorProps {
  collapsed?: boolean
}

export default function ProjectSelector({ collapsed }: ProjectSelectorProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: projects, isLoading: projectsLoading } = useProjectListQuery()
  const { data: currentProject, isLoading: currentLoading } = useCurrentProjectQuery()
  const { data: universes } = useGetUniverseQuery()

  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set())
  const [editProjectId, setEditProjectId] = useState<number | null>(null)

  const isLoading = projectsLoading || currentLoading

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  const activeProject = projects?.find(p => p.isCurrent)
  const otherProjects = projects?.filter(p => !p.isCurrent) ?? []

  const toggleProject = (projectId: number) => {
    setExpandedProjects(prev => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  // Collapsed view - just show icons for active project nav items
  if (collapsed) {
    return (
      <div className="flex flex-col gap-1 px-2">
        {activeProject && (
          <>
            <NavItem
              icon={<Home className="size-5" />}
              label={activeProject.name}
              isActive={location.pathname === `/projects/${activeProject.id}`}
              collapsed
              onClick={() => navigate(`/projects/${activeProject.id}`)}
            />
            <NavItem
              icon={<Braces className="size-5" />}
              label="Scripts"
              isActive={location.pathname.startsWith("/scripts") || location.pathname.includes("/scripts")}
              collapsed
              onClick={() => navigate(`/projects/${activeProject.id}/scripts`)}
            />
            <NavItem
              icon={<Spotlight className="size-5" />}
              label="Scenes"
              isActive={location.pathname.startsWith("/scenes") || location.pathname.includes("/scenes")}
              collapsed
              onClick={() => navigate(`/projects/${activeProject.id}/scenes`)}
            />
            <NavItem
              icon={<IterationCw className="size-5" />}
              label="Chases"
              isActive={location.pathname.startsWith("/chases") || location.pathname.includes("/chases")}
              collapsed
              onClick={() => navigate(`/projects/${activeProject.id}/chases`)}
            />
            <NavItem
              icon={<LayoutGrid className="size-5" />}
              label="Fixtures"
              isActive={location.pathname.startsWith("/fixtures")}
              collapsed
              onClick={() => navigate("/fixtures")}
            />
            <NavItem
              icon={<Layers className="size-5" />}
              label="Groups"
              isActive={location.pathname.startsWith("/groups")}
              collapsed
              onClick={() => navigate("/groups")}
            />
            {(universes ?? []).map(universe => (
              <NavItem
                key={universe}
                icon={<SlidersHorizontal className="size-5" />}
                label={`Universe ${universe}`}
                isActive={location.pathname === `/channels/${universe}`}
                collapsed
                onClick={() => navigate(`/channels/${universe}`)}
              />
            ))}
            <NavItem
              icon={<Settings className="size-5" />}
              label="Configure"
              isActive={false}
              collapsed
              onClick={() => setEditProjectId(activeProject.id)}
            />
          </>
        )}
        <NavItem
          icon={<List className="size-5" />}
          label="Manage Projects"
          isActive={location.pathname === "/projects"}
          collapsed
          onClick={() => navigate("/projects")}
        />
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

  // Expanded view - full tree structure
  return (
    <div className="py-2">
      <div className="px-4 pb-1 text-xs font-medium text-muted-foreground">
        Projects
      </div>

      {/* Active project - always expanded */}
      {activeProject && (
        <ActiveProjectSection
          project={activeProject}
          universes={universes ?? []}
          location={location}
          navigate={navigate}
          onConfigure={() => setEditProjectId(activeProject.id)}
        />
      )}

      {/* Other projects - collapsible */}
      {otherProjects.map(project => (
        <OtherProjectSection
          key={project.id}
          project={project}
          isExpanded={expandedProjects.has(project.id)}
          onToggle={() => toggleProject(project.id)}
          location={location}
          navigate={navigate}
          onConfigure={() => setEditProjectId(project.id)}
        />
      ))}

      {/* Manage Projects link */}
      <div className="px-2 mt-2">
        <NavItem
          icon={<List className="size-5" />}
          label="Manage Projects"
          isActive={location.pathname === "/projects"}
          collapsed={false}
          onClick={() => navigate("/projects")}
        />
      </div>

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

// Active project section - always expanded with all nav items
function ActiveProjectSection({
  project,
  universes,
  location,
  navigate,
  onConfigure,
}: {
  project: ProjectSummary
  universes: readonly number[]
  location: ReturnType<typeof useLocation>
  navigate: ReturnType<typeof useNavigate>
  onConfigure: () => void
}) {
  const isOnOverview = location.pathname === `/projects/${project.id}`

  return (
    <div className="mb-2">
      {/* Project header - clickable to go to overview */}
      <button
        onClick={() => navigate(`/projects/${project.id}`)}
        className={cn(
          "flex items-center gap-2 px-4 py-1 w-full hover:bg-accent rounded-md transition-colors",
          isOnOverview && "bg-accent"
        )}
      >
        <Circle className="size-2 fill-primary text-primary" />
        <span className="text-sm font-medium truncate">{project.name}</span>
      </button>

      {/* Nav items */}
      <div className="pl-4 pr-2 space-y-0.5">
        <NavItem
          icon={<Braces className="size-4" />}
          label="Scripts"
          isActive={location.pathname.startsWith("/scripts") || (location.pathname.includes("/scripts") && location.pathname.includes(`/projects/${project.id}`))}
          collapsed={false}
          onClick={() => navigate(`/projects/${project.id}/scripts`)}
          indent
        />
        <NavItem
          icon={<Spotlight className="size-4" />}
          label="Scenes"
          isActive={location.pathname.startsWith("/scenes") || (location.pathname.includes("/scenes") && location.pathname.includes(`/projects/${project.id}`))}
          collapsed={false}
          onClick={() => navigate(`/projects/${project.id}/scenes`)}
          indent
        />
        <NavItem
          icon={<IterationCw className="size-4" />}
          label="Chases"
          isActive={location.pathname.startsWith("/chases") || (location.pathname.includes("/chases") && location.pathname.includes(`/projects/${project.id}`))}
          collapsed={false}
          onClick={() => navigate(`/projects/${project.id}/chases`)}
          indent
        />
        <NavItem
          icon={<LayoutGrid className="size-4" />}
          label="Fixtures"
          isActive={location.pathname.startsWith("/fixtures")}
          collapsed={false}
          onClick={() => navigate("/fixtures")}
          indent
        />
        <NavItem
          icon={<Layers className="size-4" />}
          label="Groups"
          isActive={location.pathname.startsWith("/groups")}
          collapsed={false}
          onClick={() => navigate("/groups")}
          indent
        />
        {universes.map(universe => (
          <NavItem
            key={universe}
            icon={<SlidersHorizontal className="size-4" />}
            label={`Universe ${universe}`}
            isActive={location.pathname === `/channels/${universe}`}
            collapsed={false}
            onClick={() => navigate(`/channels/${universe}`)}
            indent
          />
        ))}
        <NavItem
          icon={<Settings className="size-4" />}
          label="Configure"
          isActive={false}
          collapsed={false}
          onClick={onConfigure}
          indent
        />
      </div>
    </div>
  )
}

// Other project section - collapsible
function OtherProjectSection({
  project,
  isExpanded,
  onToggle,
  location,
  navigate,
  onConfigure,
}: {
  project: ProjectSummary
  isExpanded: boolean
  onToggle: () => void
  location: ReturnType<typeof useLocation>
  navigate: ReturnType<typeof useNavigate>
  onConfigure: () => void
}) {
  const isOnOverview = location.pathname === `/projects/${project.id}`
  const isViewingThisProject = location.pathname.includes(`/projects/${project.id}`)

  return (
    <div>
      {/* Project header */}
      <div className="flex items-center px-4 py-1 w-full hover:bg-accent rounded-md transition-colors">
        <button
          onClick={onToggle}
          className="flex-shrink-0"
        >
          <ChevronRight
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              isExpanded && "rotate-90"
            )}
          />
        </button>
        <button
          onClick={() => navigate(`/projects/${project.id}`)}
          className={cn(
            "flex-1 text-left ml-2 rounded px-1 -mx-1",
            isOnOverview && "bg-accent"
          )}
        >
          <span className={cn(
            "text-sm truncate",
            isViewingThisProject && "font-medium"
          )}>
            {project.name}
          </span>
        </button>
      </div>

      {/* Nav items */}
      {isExpanded && (
        <div className="pl-4 pr-2 space-y-0.5">
          <NavItem
            icon={<Braces className="size-4" />}
            label="Scripts"
            isActive={location.pathname === `/projects/${project.id}/scripts` || location.pathname.startsWith(`/projects/${project.id}/scripts/`)}
            collapsed={false}
            onClick={() => navigate(`/projects/${project.id}/scripts`)}
            indent
          />
          <NavItem
            icon={<Spotlight className="size-4" />}
            label="Scenes"
            isActive={location.pathname === `/projects/${project.id}/scenes`}
            collapsed={false}
            onClick={() => navigate(`/projects/${project.id}/scenes`)}
            indent
          />
          <NavItem
            icon={<IterationCw className="size-4" />}
            label="Chases"
            isActive={location.pathname === `/projects/${project.id}/chases`}
            collapsed={false}
            onClick={() => navigate(`/projects/${project.id}/chases`)}
            indent
          />
          <NavItem
            icon={<Settings className="size-4" />}
            label="Configure"
            isActive={false}
            collapsed={false}
            onClick={onConfigure}
            indent
          />
        </div>
      )}
    </div>
  )
}

// Reusable nav item component
interface NavItemProps {
  icon: React.ReactNode
  label: string
  isActive: boolean
  collapsed: boolean
  onClick: () => void
  indent?: boolean
}

function NavItem({ icon, label, isActive, collapsed, onClick, indent }: NavItemProps) {
  const button = (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        isActive && "bg-accent text-accent-foreground",
        collapsed && "justify-center px-2",
        indent && "pl-6"
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

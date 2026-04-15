import React from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Loader2, FolderOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { useProjectListQuery } from "./store/projects"
import {
  useNavItems,
  filterNavItems,
  type NavItem as NavItemDef,
} from "./navigation"

interface ProjectSwitcherProps {
  collapsed?: boolean
}

export default function ProjectSwitcher({ collapsed }: ProjectSwitcherProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: projects, isLoading: projectsLoading } = useProjectListQuery()
  const allNavItems = useNavItems()

  const viewedProject = useViewedProject()
  const activeProject = projects?.find((p) => p.isCurrent)
  const isViewingActiveProject = viewedProject?.id === activeProject?.id
  const visibleItems = filterNavItems(allNavItems, isViewingActiveProject)

  if (projectsLoading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  if (!viewedProject) return null

  // Collapsed view - icon-only buttons
  if (collapsed) {
    return (
      <div className="flex flex-col">
        {/* Project link (collapsed) */}
        <div className="px-2 pb-2 mb-1 border-b">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-full"
                onClick={() => navigate(`/projects/${viewedProject.id}`)}
              >
                <FolderOpen className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{viewedProject.name}</TooltipContent>
          </Tooltip>
        </div>

        {/* Navigation items, grouped with separators */}
        <div className="flex flex-col gap-1 px-2">
          {visibleItems.map((item, idx) => (
            <React.Fragment key={item.id}>
              {idx > 0 && item.group !== visibleItems[idx - 1].group && (
                <Separator className="mx-1 my-1" />
              )}
              <NavItem
                icon={<item.icon className="size-5" />}
                label={item.label}
                isActive={isItemActive(item, location.pathname)}
                collapsed
                onClick={() => navigate(item.path(viewedProject.id))}
              />
            </React.Fragment>
          ))}
        </div>
      </div>
    )
  }

  // Expanded view
  return (
    <div className="flex flex-col">
      {/* Project header - read as metadata, not a nav row */}
      <div className="px-2 pb-2 mb-2 border-b">
        <button
          onClick={() => navigate(`/projects/${viewedProject.id}`)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent min-w-0"
        >
          <FolderOpen className="size-4 text-muted-foreground shrink-0" />
          <span className="font-semibold truncate">{viewedProject.name}</span>
          {!isViewingActiveProject && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0 ml-auto">
              Inactive
            </Badge>
          )}
        </button>
      </div>

      {/* Navigation items, grouped with separators */}
      <div className="px-2 space-y-0.5">
        {visibleItems.map((item, idx) => (
          <React.Fragment key={item.id}>
            {idx > 0 && item.group !== visibleItems[idx - 1].group && (
              <Separator className="mx-1 my-2" />
            )}
            <NavItem
              icon={<item.icon className="size-4" />}
              label={item.label}
              isActive={isItemActive(item, location.pathname)}
              collapsed={false}
              onClick={() => navigate(item.path(viewedProject.id))}
            />
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

function isItemActive(item: NavItemDef, pathname: string): boolean {
  return new RegExp(item.pathMatch + '(/|$)').test(pathname)
}

/** Hook to get the currently viewed project for use by Layout's configure footer and CommandPalette. */
export function useViewedProject() {
  const params = useParams()
  const { data: projects } = useProjectListQuery()

  const activeProject = projects?.find((p) => p.isCurrent)
  const viewedProjectId = params.projectId ? parseInt(params.projectId) : activeProject?.id
  return projects?.find((p) => p.id === viewedProjectId) ?? activeProject
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

export function NavItem({ icon, label, isActive, collapsed, onClick, muted }: NavItemProps) {
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

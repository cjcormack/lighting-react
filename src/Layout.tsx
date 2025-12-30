import React from "react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import {
  ChevronLeft,
  Menu,
  Braces,
  SlidersHorizontal,
  Spotlight,
  LayoutGrid,
  IterationCw,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import TrackStatus from "./TrackStatus"
import { ConnectionStatus } from "./connection"
import { useGetUniverseQuery } from "./store/universes"
import ProjectSelector from "./ProjectSelector"
import ThemeToggle from "./ThemeToggle"

const DRAWER_WIDTH = 240
const DRAWER_COLLAPSED_WIDTH = 64

interface NavItemProps {
  icon: React.ReactNode
  label: string
  href: string
  isActive: boolean
  collapsed: boolean
  onClick: () => void
}

function NavItem({ icon, label, isActive, collapsed, onClick }: NavItemProps) {
  const button = (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        isActive && "bg-accent text-accent-foreground",
        collapsed && "justify-center px-2"
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

export default function Layout() {
  const [open, setOpen] = React.useState(true)
  const toggleDrawer = () => {
    setOpen(!open)
  }

  const navigate = useNavigate()
  const location = useLocation()

  const { data: universes } = useGetUniverseQuery()

  const sidebarWidth = open ? DRAWER_WIDTH : DRAWER_COLLAPSED_WIDTH

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen">
        {/* Sidebar */}
        <aside
          className={cn(
            "flex flex-col border-r bg-background transition-all duration-200",
            "fixed inset-y-0 left-0 z-50"
          )}
          style={{ width: sidebarWidth }}
        >
          {/* Sidebar Header */}
          <div className="flex h-14 items-center justify-end border-b px-2">
            <Button variant="ghost" size="icon" onClick={toggleDrawer}>
              {open ? (
                <ChevronLeft className="size-5" />
              ) : (
                <Menu className="size-5" />
              )}
            </Button>
          </div>

          {/* Sidebar Content */}
          <div className="flex-1 overflow-y-auto py-2">
            <div className="px-2">
              <TrackStatus collapsed={!open} />
            </div>

            <Separator className="my-2" />

            <ProjectSelector collapsed={!open} />

            <Separator className="my-2" />

            {/* Navigation Section */}
            <div className="px-2">
              {!open ? null : (
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
                  Lights
                </div>
              )}
              <nav className="space-y-1">
                <NavItem
                  icon={<Braces className="size-5" />}
                  label="Scripts"
                  href="/scripts"
                  isActive={location.pathname.startsWith("/scripts") || location.pathname.includes("/scripts")}
                  collapsed={!open}
                  onClick={() => navigate("/scripts")}
                />
                <NavItem
                  icon={<Spotlight className="size-5" />}
                  label="Scenes"
                  href="/scenes"
                  isActive={location.pathname.startsWith("/scenes")}
                  collapsed={!open}
                  onClick={() => navigate("/scenes")}
                />
                <NavItem
                  icon={<IterationCw className="size-5" />}
                  label="Chases"
                  href="/chases"
                  isActive={location.pathname.startsWith("/chases")}
                  collapsed={!open}
                  onClick={() => navigate("/chases")}
                />
                <NavItem
                  icon={<LayoutGrid className="size-5" />}
                  label="Fixtures"
                  href="/fixtures"
                  isActive={location.pathname.startsWith("/fixtures")}
                  collapsed={!open}
                  onClick={() => navigate("/fixtures")}
                />
                {(universes || []).map((universe) => (
                  <NavItem
                    key={universe}
                    icon={<SlidersHorizontal className="size-5" />}
                    label={`Universe ${universe}`}
                    href={`/channels/${universe}`}
                    isActive={location.pathname === `/channels/${universe}`}
                    collapsed={!open}
                    onClick={() => navigate(`/channels/${universe}`)}
                  />
                ))}
              </nav>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div
          className="flex flex-1 flex-col transition-all duration-200 min-w-0"
          style={{ marginLeft: sidebarWidth }}
        >
          {/* Header */}
          <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-primary px-4 text-primary-foreground">
            <h1 className="flex-1 text-lg font-semibold">
              Chris&apos; DMX Controller v7
            </h1>
            <ConnectionStatus />
            <ThemeToggle />
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-auto bg-muted/40 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}

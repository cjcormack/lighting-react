import React from "react"
import { Outlet } from "react-router-dom"
import { ChevronLeft, Menu } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import TrackStatus from "./TrackStatus"
import { ConnectionStatus } from "./connection"
import ProjectSwitcher from "./ProjectSwitcher"
import ThemeToggle from "./ThemeToggle"

const DRAWER_WIDTH = 240
const DRAWER_COLLAPSED_WIDTH = 64

export default function Layout() {
  const [open, setOpen] = React.useState(true)
  const toggleDrawer = () => {
    setOpen(!open)
  }

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

            <ProjectSwitcher collapsed={!open} />
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

import React, { useState } from "react"
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
import { FixtureOverviewToggle } from "./components/FixtureOverviewToggle"
import { FixtureOverviewPanel } from "./components/FixtureOverviewPanel"
import { EffectsOverviewToggle } from "./components/EffectsOverviewToggle"
import { EffectsOverviewPanel } from "./components/EffectsOverviewPanel"
import { FixtureDetailModal } from "./components/groups/FixtureDetailModal"
import { useFixtureOverview } from "./hooks/useFixtureOverview"
import { useEffectsOverview } from "./hooks/useEffectsOverview"

const DRAWER_WIDTH = 240
const DRAWER_COLLAPSED_WIDTH = 64

export default function Layout() {
  const [open, setOpen] = React.useState(true)
  const [selectedFixture, setSelectedFixture] = useState<string | null>(null)
  const { isVisible: isOverviewVisible, toggle: toggleOverview } = useFixtureOverview()
  const { isVisible: isEffectsVisible, toggle: toggleEffects } = useEffectsOverview()

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
          <header className="sticky top-0 z-40 border-b bg-primary px-4 py-2 text-primary-foreground">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1 className="text-lg font-semibold whitespace-nowrap">
                Chris&apos; DMX Controller v7
              </h1>
              <div className="flex-1" />
              <div className="flex flex-wrap items-center gap-2">
                <ConnectionStatus />
                <FixtureOverviewToggle isVisible={isOverviewVisible} onToggle={toggleOverview} />
                <EffectsOverviewToggle isVisible={isEffectsVisible} onToggle={toggleEffects} />
                <ThemeToggle />
              </div>
            </div>
          </header>

          {/* Fixture Overview Panel - always rendered for animation */}
          <FixtureOverviewPanel
            onFixtureClick={setSelectedFixture}
            isVisible={isOverviewVisible}
          />

          {/* Effects Overview Panel - always rendered for animation */}
          <EffectsOverviewPanel isVisible={isEffectsVisible} />

          {/* Page Content */}
          <main className="flex-1 overflow-auto bg-muted/40 min-w-0">
            <Outlet />
          </main>

          {/* Fixture Detail Modal - opens in edit mode from overview */}
          <FixtureDetailModal
            fixtureKey={selectedFixture}
            onClose={() => setSelectedFixture(null)}
            isEditing
          />
        </div>
      </div>
    </TooltipProvider>
  )
}

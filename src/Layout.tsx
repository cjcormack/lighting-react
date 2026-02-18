import React, { useState, useEffect } from "react"
import { Outlet, useLocation } from "react-router-dom"
import { ChevronLeft, Menu } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/useMediaQuery"

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
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [selectedFixture, setSelectedFixture] = useState<string | null>(null)
  const { isVisible: isOverviewVisible, toggle: toggleOverview } = useFixtureOverview()
  const { isVisible: isEffectsVisible, isLocked: isEffectsLocked, toggle: toggleEffects, lock: lockEffects, unlock: unlockEffects } = useEffectsOverview()
  const location = useLocation()
  const isFxRoute = /\/projects\/\d+\/fx/.test(location.pathname)
  const isDesktop = useMediaQuery('(min-width: 768px)')

  // Auto-show & lock effects overview when on the FX busking route
  useEffect(() => {
    if (isFxRoute) {
      lockEffects()
    } else {
      unlockEffects()
    }
  }, [isFxRoute, lockEffects, unlockEffects])

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileDrawerOpen(false)
  }, [location.pathname])

  const toggleDrawer = () => {
    setOpen(!open)
  }

  const sidebarWidth = open ? DRAWER_WIDTH : DRAWER_COLLAPSED_WIDTH

  // Sidebar content (shared between desktop and mobile)
  const renderSidebarContent = (collapsed: boolean) => (
    <div className="flex-1 overflow-y-auto py-2">
      <div className="px-2">
        <TrackStatus collapsed={collapsed} />
      </div>

      <Separator className="my-2" />

      <ProjectSwitcher collapsed={collapsed} />
    </div>
  )

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen">
        {/* Desktop Sidebar */}
        {isDesktop && (
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

            {renderSidebarContent(!open)}
          </aside>
        )}

        {/* Mobile Drawer Overlay */}
        {!isDesktop && (
          <>
            {/* Backdrop */}
            <div
              className={cn(
                "fixed inset-0 z-50 bg-black/50 transition-opacity duration-200",
                mobileDrawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"
              )}
              onClick={() => setMobileDrawerOpen(false)}
            />
            {/* Drawer */}
            <aside
              className={cn(
                "fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-background transition-transform duration-200",
              )}
              style={{
                width: DRAWER_WIDTH,
                transform: mobileDrawerOpen ? 'translateX(0)' : 'translateX(-100%)',
              }}
            >
              {/* Drawer Header */}
              <div className="flex h-14 items-center justify-between border-b px-3">
                <span className="font-semibold text-sm">Menu</span>
                <Button variant="ghost" size="icon" onClick={() => setMobileDrawerOpen(false)}>
                  <ChevronLeft className="size-5" />
                </Button>
              </div>

              {renderSidebarContent(false)}
            </aside>
          </>
        )}

        {/* Main Content Area */}
        <div
          className="flex flex-1 flex-col transition-all duration-200 min-w-0"
          style={{ marginLeft: isDesktop ? sidebarWidth : 0 }}
        >
          {/* Header */}
          <header className="sticky top-0 z-40 border-b bg-primary px-4 py-2 text-primary-foreground">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* Mobile hamburger button */}
              {!isDesktop && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-primary-foreground hover:bg-primary-foreground/10 -ml-2"
                  onClick={() => setMobileDrawerOpen(true)}
                >
                  <Menu className="size-5" />
                </Button>
              )}
              <h1 className="text-lg font-semibold whitespace-nowrap">
                Chris&apos; DMX Controller v7
              </h1>
              <div className="flex-1" />
              <div className="flex flex-wrap items-center gap-2">
                <ConnectionStatus />
                <FixtureOverviewToggle isVisible={isOverviewVisible} onToggle={toggleOverview} />
                <EffectsOverviewToggle isVisible={isEffectsVisible} isLocked={isEffectsLocked} onToggle={toggleEffects} />
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
          <EffectsOverviewPanel isVisible={isEffectsVisible} isLocked={isEffectsLocked} />

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

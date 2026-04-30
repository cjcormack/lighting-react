import React, { useState, useEffect } from "react"
import { Outlet, useLocation } from "react-router-dom"
import { ChevronLeft, Menu, Settings, LayoutGrid, Grid3X3, AudioWaveform, Sparkles, Theater, Computer } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/useMediaQuery"

import { ConnectionStatus } from "./connection"
import ProjectSwitcher, { useViewedProject, NavItem } from "./ProjectSwitcher"
import ThemeToggle from "./ThemeToggle"
import { FixtureOverviewToggle } from "./components/FixtureOverviewToggle"
import { FixtureOverviewPanel } from "./components/FixtureOverviewPanel"
import { StageOverviewToggle } from "./components/StageOverviewToggle"
import { StageOverviewPanel } from "./components/StageOverviewPanel"
import { EffectsOverviewToggle } from "./components/EffectsOverviewToggle"
import { EffectsOverviewPanel } from "./components/EffectsOverviewPanel"
import { FixtureDetailModal } from "./components/groups/FixtureDetailModal"
import { useFixtureOverview } from "./hooks/useFixtureOverview"
import { useStageOverview } from "./hooks/useStageOverview"
import { useEffectsOverview } from "./hooks/useEffectsOverview"
import { AiChatToggle } from "./components/ai/AiChatToggle"
import { AiChatPanel } from "./components/ai/AiChatPanel"
import { CueSlotOverviewToggle } from "./components/CueSlotOverviewToggle"
import { CueSlotOverviewPanel, CueSlotDndProvider } from "./components/CueSlotOverviewPanel"
import { useCueSlotOverview } from "./hooks/useCueSlotOverview"
import EditProjectDialog from "./EditProjectDialog"
import EditInstallDialog from "./EditInstallDialog"
import CommandPalette from "./components/CommandPalette"
import { AddEditFxSheet, type FxTarget } from "./components/fx/AddEditFxSheet"
import { ChannelValueDialog } from "./components/ChannelValueDialog"
import { SyncNotifications } from "./components/cloudSync/SyncNotifications"

const DRAWER_WIDTH = 240
const DRAWER_COLLAPSED_WIDTH = 64

export default function Layout() {
  const [open, setOpen] = React.useState(true)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [selectedFixture, setSelectedFixture] = useState<string | null>(null)
  const [isAiChatVisible, setIsAiChatVisible] = useState(false)
  const [editProjectId, setEditProjectId] = useState<number | null>(null)
  const [installDialogOpen, setInstallDialogOpen] = useState(false)
  const [applyFxTarget, setApplyFxTarget] = useState<FxTarget | null>(null)
  const [channelDialogMode, setChannelDialogMode] = useState<"park" | "set" | null>(null)
  const { isVisible: isOverviewVisible, toggle: toggleOverview } = useFixtureOverview()
  const { isVisible: isStageVisible, toggle: toggleStage } = useStageOverview()
  const { isVisible: isEffectsVisible, isLocked: isEffectsLocked, toggle: toggleEffects, lock: lockEffects, unlock: unlockEffects } = useEffectsOverview()
  const { isVisible: isCueSlotsVisible, toggle: toggleCueSlots } = useCueSlotOverview()
  const location = useLocation()
  const isFxRoute = /\/projects\/\d+\/fx/.test(location.pathname)
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const viewedProject = useViewedProject()

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
    <>
      <div className="flex-1 overflow-y-auto py-2">
        <ProjectSwitcher collapsed={collapsed} />
      </div>

      {/* Configure footer - outside scroll area so it's always visible */}
      <div className="border-t px-2 py-2 space-y-1">
        {viewedProject && (
          <NavItem
            icon={<Settings className={collapsed ? "size-5" : "size-4"} />}
            label="Configure Project"
            isActive={false}
            collapsed={collapsed}
            onClick={() => setEditProjectId(viewedProject.id)}
            muted
          />
        )}
        <NavItem
          icon={<Computer className={collapsed ? "size-5" : "size-4"} />}
          label="Install Settings"
          isActive={false}
          collapsed={collapsed}
          onClick={() => setInstallDialogOpen(true)}
          muted
        />
      </div>
    </>
  )

  return (
    <TooltipProvider delayDuration={0}>
      <SyncNotifications />
      <div className="flex h-dvh">
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
                <StageOverviewToggle isVisible={isStageVisible} onToggle={toggleStage} />
                <FixtureOverviewToggle isVisible={isOverviewVisible} onToggle={toggleOverview} />
                <CueSlotOverviewToggle isVisible={isCueSlotsVisible} onToggle={toggleCueSlots} />
                <EffectsOverviewToggle isVisible={isEffectsVisible} isLocked={isEffectsLocked} onToggle={toggleEffects} />
                <AiChatToggle isVisible={isAiChatVisible} onToggle={() => setIsAiChatVisible(!isAiChatVisible)} />
                <ThemeToggle />
              </div>
            </div>
          </header>

          {/* Stage Overview Panel - always rendered for animation */}
          <StageOverviewPanel
            isVisible={isStageVisible}
            selectedFixtureKey={selectedFixture}
            onFixtureClick={setSelectedFixture}
          />

          {/* Fixture Overview Panel - always rendered for animation */}
          <FixtureOverviewPanel
            onFixtureClick={setSelectedFixture}
            isVisible={isOverviewVisible}
          />

          {/* Effects Overview Panel - always rendered for animation */}
          <EffectsOverviewPanel isVisible={isEffectsVisible} isLocked={isEffectsLocked} isDesktop={isDesktop} />

          {/* Cue Slot DnD Provider wraps panel + page content for cross-component drag-and-drop */}
          <CueSlotDndProvider isVisible={isCueSlotsVisible}>
            {/* Cue Slot Overview Panel - always rendered for animation */}
            <CueSlotOverviewPanel isVisible={isCueSlotsVisible} />

            {/* Page Content */}
            <main className="flex-1 overflow-auto bg-muted/40 min-w-0">
              <Outlet />
            </main>
          </CueSlotDndProvider>

          {/* Fixture Detail Modal - opens in edit mode from overview */}
          <FixtureDetailModal
            fixtureKey={selectedFixture}
            onClose={() => setSelectedFixture(null)}
            isEditing
          />
        </div>

        {/* AI Chat Panel */}
        <AiChatPanel
          isOpen={isAiChatVisible}
          onClose={() => setIsAiChatVisible(false)}
        />

        {/* Command Palette */}
        <CommandPalette
          onConfigureProject={viewedProject ? () => setEditProjectId(viewedProject.id) : undefined}
          onApplyFx={setApplyFxTarget}
          onParkChannelAtValue={() => setChannelDialogMode("park")}
          onSetChannelValue={() => setChannelDialogMode("set")}
          toggles={[
            { label: "Stage Overview", icon: Theater, isVisible: isStageVisible, onToggle: toggleStage },
            { label: "Fixture Overview", icon: LayoutGrid, isVisible: isOverviewVisible, onToggle: toggleOverview },
            { label: "Cue Slots", icon: Grid3X3, isVisible: isCueSlotsVisible, onToggle: toggleCueSlots },
            { label: "Effects Overview", icon: AudioWaveform, isVisible: isEffectsVisible, onToggle: toggleEffects },
            { label: "Lux (AI Chat)", icon: Sparkles, isVisible: isAiChatVisible, onToggle: () => setIsAiChatVisible(v => !v) },
          ]}
        />

        {/* Channel Value Dialog (Park / Set) */}
        <ChannelValueDialog
          open={channelDialogMode !== null}
          onOpenChange={(open) => { if (!open) setChannelDialogMode(null) }}
          mode={channelDialogMode ?? "set"}
        />

        {/* Edit Project Dialog (shared - triggered by sidebar footer or command palette) */}
        {editProjectId !== null && (
          <EditProjectDialog
            open={true}
            setOpen={(o) => !o && setEditProjectId(null)}
            projectId={editProjectId}
          />
        )}

        <EditInstallDialog open={installDialogOpen} setOpen={setInstallDialogOpen} />

        {/* Apply FX Sheet (triggered by command palette) */}
        {applyFxTarget && (
          <AddEditFxSheet
            target={applyFxTarget}
            mode={{ mode: "add" }}
            onClose={() => setApplyFxTarget(null)}
          />
        )}
      </div>
    </TooltipProvider>
  )
}

import React, { useState, useEffect, useCallback, lazy, Suspense } from "react"
import { Outlet, useLocation } from "react-router"
import { ChevronLeft, Menu, Sparkles, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FeatureErrorBoundary } from "./components/FeatureErrorBoundary"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/useMediaQuery"

import { ConnectionStatus } from "./connection"
import { ProgrammerIndicator } from './components/ProgrammerIndicator'
import ProjectSwitcher from "./ProjectSwitcher"
import ThemeToggle from "./ThemeToggle"
import { UserMenu } from "./components/auth/UserMenu"
import { FixtureOverviewPanel } from "./components/FixtureOverviewPanel"
import { StageOverviewPanel } from "./components/StageOverviewPanel"
import { FixtureDetailModal } from "./components/groups/FixtureDetailModal"
import { OverviewToggle, useOverviewPanels } from "./components/overviewPanels"
import { AiChatToggle } from "./components/ai/AiChatToggle"
import { CueSlotOverviewPanel, CueSlotDndProvider } from "./components/CueSlotOverviewPanel"
import CommandPalette from "./components/CommandPalette"
import { AddEditFxSheet, type FxTarget } from "./components/fx/AddEditFxSheet"
import { ChannelValueDialog } from "./components/ChannelValueDialog"
import { SyncNotifications } from "./components/cloudSync/SyncNotifications"
import { SyncReauthBanner } from "./components/cloudSync/SyncReauthBanner"

const DRAWER_WIDTH = 240
const DRAWER_COLLAPSED_WIDTH = 64

/**
 * The AI chat panel behind a lazy boundary — react-markdown and its remark/micromark stack are
 * ~120 kB, and the panel is the only thing in the app that renders Markdown. It sits in Layout
 * rather than on a route, so the split is a mount latch rather than a route boundary: nothing is
 * fetched until the operator first opens Lux, and the panel then stays mounted for the rest of
 * the session because the conversation lives in its own component state and closing must not
 * discard it.
 */
const AiChatPanel = lazy(() =>
  import("./components/ai/AiChatPanel").then((m) => ({ default: m.AiChatPanel })),
)

/**
 * Reserves the page area while a lazily-imported route chunk loads. Everything outside `<main>` —
 * the drawer, the ShowBar, the overview panels — is already mounted and stays put, so this only
 * has to fill the scroll container, matching what those routes show while their own queries load.
 */
function RouteFallback() {
  return (
    <Card className="m-4 p-4 flex items-center justify-center">
      <Loader2 className="size-6 animate-spin" />
    </Card>
  )
}

export default function Layout() {
  const [open, setOpen] = React.useState(true)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [selectedFixture, setSelectedFixture] = useState<string | null>(null)
  const [isAiChatVisible, setIsAiChatVisible] = useState(false)
  // Latched by the first open and never cleared — see the `AiChatPanel` note above. Go through
  // `setAiChatVisible` rather than `setIsAiChatVisible` so every opener trips the latch.
  const [hasOpenedAiChat, setHasOpenedAiChat] = useState(false)
  const setAiChatVisible = useCallback((visible: boolean) => {
    if (visible) setHasOpenedAiChat(true)
    setIsAiChatVisible(visible)
  }, [])
  const [applyFxTarget, setApplyFxTarget] = useState<FxTarget | null>(null)
  const [channelDialogMode, setChannelDialogMode] = useState<"park" | "set" | null>(null)
  const { panels, byId } = useOverviewPanels()
  const location = useLocation()
  const isDesktop = useMediaQuery('(min-width: 768px)')

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
      <ProjectSwitcher collapsed={collapsed} />
    </div>
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
          {/* Header. The tool row must stay on ONE line: it is chrome, and a wrapped chrome
              bar eats a third of an iPhone's viewport before any content renders.

              Breakpoints here are CONTAINER queries, not viewport ones, for the same reason
              ShowBar uses them — the desktop sidebar insets this region by 64–240px, so at a
              768px viewport the header really has ~528px to work with. Viewport breakpoints
              expand the status/programmer chips into space that isn't there, which then
              squeezes the title down to a stub.

              The thresholds are measured, not guessed: the title is 188px, the compact tool
              row 320px, and the row grows to ~455px once the status and programmer chips
              show their labels. So the title appears at 620px (fits untruncated even with
              the mobile hamburger) and the chips expand at 760px (title + expanded row +
              padding ≈ 691px, with margin). */}
          <header className="@container sticky top-0 z-40 border-b bg-primary px-2 py-2 text-primary-foreground sm:px-4">
            <div className="flex items-center gap-x-2 sm:gap-x-4">
              {/* Mobile hamburger button */}
              {!isDesktop && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-primary-foreground hover:bg-primary-foreground/10 -ml-1 shrink-0"
                  onClick={() => setMobileDrawerOpen(true)}
                >
                  <Menu className="size-5" />
                </Button>
              )}
              {/* Hidden rather than truncated when the row is tight: a title clipped to
                  "C" is noise, and the hamburger plus the page's own breadcrumbs already
                  say where you are. */}
              <h1 className="hidden min-w-0 flex-1 truncate text-base font-semibold @[620px]:block @[760px]:text-lg">
                Chris&apos; DMX Controller v7
              </h1>
              <div className="flex-1 @[620px]:hidden" />
              <div className="flex shrink-0 items-center gap-1 overflow-x-auto sm:gap-2">
                <ConnectionStatus />
                <ProgrammerIndicator />
                {panels.map((panel) => (
                  <OverviewToggle key={panel.id} panel={panel} />
                ))}
                <AiChatToggle isVisible={isAiChatVisible} onToggle={() => setAiChatVisible(!isAiChatVisible)} />
                <ThemeToggle />
                <UserMenu />
              </div>
            </div>
          </header>

          {/* The three overview panels. Each is always rendered — but only its animated wrapper
              is: every one of them puts its live body behind `CollapsiblePanel`, which unmounts
              it once the collapse has finished. Adding a panel here means doing the same, or the
              rig pays for it on every route the operator is on. */}
          <StageOverviewPanel
            isVisible={byId.stage.isVisible}
            selectedFixtureKey={selectedFixture}
            onFixtureClick={setSelectedFixture}
          />

          <FixtureOverviewPanel
            onFixtureClick={setSelectedFixture}
            isVisible={byId.fixtures.isVisible}
          />

          {/* Cue Slot DnD Provider wraps panel + page content for cross-component drag-and-drop */}
          <CueSlotDndProvider isVisible={byId.cueSlots.isVisible}>
            <CueSlotOverviewPanel isVisible={byId.cueSlots.isVisible} />

            {/* Page Content. The re-auth banner sits inside the scroll container's flex
                column rather than above it so it doesn't shift the ShowBar or the panels;
                it renders nothing at all unless the desk's GitHub connection is rejected
                and the viewer is an admin who can act on it. */}
            <main className="flex-1 overflow-auto bg-muted/40 min-w-0">
              <SyncReauthBanner />
              {/* Outside the Suspense, so a route chunk that never arrives is caught here rather
                  than unmounting the desk. Keyed by pathname so navigating away from a failed
                  route clears the boundary instead of pinning the error over every later page. */}
              <FeatureErrorBoundary key={location.pathname} feature="This page">
                <Suspense fallback={<RouteFallback />}>
                  <Outlet />
                </Suspense>
              </FeatureErrorBoundary>
            </main>
          </CueSlotDndProvider>

          {/* Fixture Detail Modal - opens in edit mode from overview */}
          <FixtureDetailModal
            fixtureKey={selectedFixture}
            onClose={() => setSelectedFixture(null)}
            isEditing
          />
        </div>

        {/* AI Chat Panel. Mounted from the first open onwards and never unmounted, so the
            conversation survives closing the sheet; the fallback is `null` because the panel is
            an overlay and has no layout of its own to reserve. */}
        {hasOpenedAiChat && (
          <FeatureErrorBoundary
            feature="Lux"
            className="fixed bottom-4 right-4 z-50 max-w-sm m-0"
          >
            <Suspense fallback={null}>
              <AiChatPanel
                isOpen={isAiChatVisible}
                onClose={() => setAiChatVisible(false)}
              />
            </Suspense>
          </FeatureErrorBoundary>
        )}

        {/* Command Palette */}
        <CommandPalette
          onApplyFx={setApplyFxTarget}
          onParkChannelAtValue={() => setChannelDialogMode("park")}
          onSetChannelValue={() => setChannelDialogMode("set")}
          toggles={[
            // The same three panels the toolbar renders, from the same array — the palette used to
            // declare its own copy, which is how the Stage entry drifted onto a second icon.
            ...panels.map((panel) => ({
              label: panel.label,
              icon: panel.icon,
              isVisible: panel.isVisible,
              onToggle: panel.toggle,
            })),
            { label: "Lux (AI Chat)", icon: Sparkles, isVisible: isAiChatVisible, onToggle: () => setAiChatVisible(!isAiChatVisible) },
          ]}
        />

        {/* Channel Value Dialog (Park / Set) */}
        <ChannelValueDialog
          open={channelDialogMode !== null}
          onOpenChange={(open) => { if (!open) setChannelDialogMode(null) }}
          mode={channelDialogMode ?? "set"}
        />

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

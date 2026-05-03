import { useMemo } from "react"
import {
  Anchor,
  Braces,
  Sparkles,
  LayoutGrid,
  Layers,
  AudioWaveform,
  Bookmark,
  Box,
  Clapperboard,
  SlidersHorizontal,
  Theater,
  Play,
  Cloud,
  Settings,
  Computer,
  TableProperties,
  Sliders,
  Activity,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useGetUniverseQuery } from "./store/universes"

export type NavGroup = "setup" | "program" | "live" | "settings" | "install"

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  path: (projectId: number) => string
  /** Controls when this item is shown based on project status */
  visibility: "always" | "active-only" | "inactive-only"
  /** Used to match active state against the current pathname */
  pathMatch: string
  /** Workflow group this item belongs to; used by the sidebar to insert separators. */
  group: NavGroup
  /** Optional parent item id; sub-items render indented beneath their parent. */
  parent?: string
}

/**
 * Shared navigation registry consumed by both the sidebar and command palette.
 * When adding a new page/route, add an entry here and it will automatically
 * appear in both the sidebar navigation and the Cmd+K command palette.
 *
 * Items are grouped by workflow phase (setup → program → live). The sidebar
 * renders a thin separator between groups; the order within each group is
 * preserved as declared below.
 */
export const navItems: NavItem[] = [
  // ── Setup ───────────────────────────────────────────────────────────
  {
    id: "fixtures",
    label: "Fixtures",
    icon: LayoutGrid,
    path: (p) => `/projects/${p}/fixtures`,
    visibility: "active-only",
    pathMatch: "/fixtures",
    group: "setup",
  },
  {
    id: "groups",
    label: "Groups",
    icon: Layers,
    path: (p) => `/projects/${p}/groups`,
    visibility: "active-only",
    pathMatch: "/groups",
    group: "setup",
  },

  // ── Program ─────────────────────────────────────────────────────────
  {
    id: "scripts",
    label: "Scripts",
    icon: Braces,
    path: (p) => `/projects/${p}/scripts`,
    visibility: "always",
    pathMatch: "/scripts",
    group: "program",
  },
  {
    id: "fx-library",
    label: "FX Library",
    icon: Sparkles,
    path: (p) => `/projects/${p}/fx-library`,
    visibility: "always",
    pathMatch: "/fx-library",
    group: "program",
  },
  {
    id: "presets",
    label: "FX Presets",
    icon: Bookmark,
    path: (p) => `/projects/${p}/presets`,
    visibility: "always",
    pathMatch: "/presets",
    group: "program",
  },
  {
    id: "cues",
    label: "FX Cues",
    icon: Clapperboard,
    path: (p) => `/projects/${p}/cues`,
    visibility: "always",
    pathMatch: "/cues",
    group: "program",
  },

  // ── Live ────────────────────────────────────────────────────────────
  {
    id: "fx",
    label: "FX",
    icon: AudioWaveform,
    path: (p) => `/projects/${p}/fx`,
    visibility: "active-only",
    pathMatch: "/fx",
    group: "live",
  },
  {
    id: "program",
    label: "Program",
    icon: Theater,
    path: (p) => `/projects/${p}/program`,
    visibility: "active-only",
    pathMatch: "/program",
    group: "live",
  },
  {
    id: "run",
    label: "Run",
    icon: Play,
    path: (p) => `/projects/${p}/run`,
    visibility: "active-only",
    pathMatch: "/run",
    group: "live",
  },
  {
    id: "channels",
    label: "Channels",
    icon: SlidersHorizontal,
    path: (p) => `/projects/${p}/channels/0`,
    visibility: "active-only",
    pathMatch: "/channels",
    group: "live",
  },

  // ── Settings (per-project) ──────────────────────────────────────────
  // The parent lands on the General tab; the children deep-link to their
  // sibling tabs so common destinations (Patch List in particular) are one
  // click away from the sidebar.
  {
    id: "project-settings",
    label: "Project Settings",
    icon: Settings,
    path: (p) => `/projects/${p}/settings`,
    visibility: "always",
    pathMatch: "/settings",
    group: "settings",
  },
  {
    id: "patches",
    label: "Patch List",
    icon: TableProperties,
    path: (p) => `/projects/${p}/settings/patches`,
    visibility: "always",
    pathMatch: "/settings/patches",
    group: "settings",
    parent: "project-settings",
  },
  {
    id: "surfaces",
    label: "Surfaces",
    icon: Sliders,
    path: (p) => `/projects/${p}/settings/surfaces`,
    visibility: "active-only",
    pathMatch: "/settings/surfaces",
    group: "settings",
    parent: "project-settings",
  },
  {
    id: "stage",
    label: "Stage",
    icon: Box,
    path: (p) => `/projects/${p}/settings/stage`,
    visibility: "always",
    pathMatch: "/settings/stage",
    group: "settings",
    parent: "project-settings",
  },
  {
    id: "rigging",
    label: "Rigging",
    icon: Anchor,
    path: (p) => `/projects/${p}/settings/rigging`,
    visibility: "always",
    pathMatch: "/settings/rigging",
    group: "settings",
    parent: "project-settings",
  },

  // ── Install (no project context) ────────────────────────────────────
  // Path resolvers ignore the projectId arg — these routes are install-scope.
  {
    id: "install-settings",
    label: "Install Settings",
    icon: Computer,
    path: () => "/install",
    visibility: "always",
    pathMatch: "/install",
    group: "install",
  },
  {
    id: "sync",
    label: "Sync",
    icon: Cloud,
    path: () => "/install/sync",
    visibility: "always",
    pathMatch: "/install/sync",
    group: "install",
    parent: "install-settings",
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    icon: Activity,
    path: () => "/install/diagnostics",
    visibility: "always",
    pathMatch: "/install/diagnostics",
    group: "install",
    parent: "install-settings",
  },
]

/** Returns the static navigation items. Used by the sidebar. */
export function useNavItems(): NavItem[] {
  return navItems
}

/**
 * Returns per-universe navigation items ("Universe 0", "Universe 1", …).
 * Only consumed by the Cmd+K command palette so power users can jump
 * directly to a specific universe; the sidebar shows a single "Channels"
 * entry instead.
 */
export function useUniverseNavItems(): NavItem[] {
  const { data: universes } = useGetUniverseQuery()

  return useMemo(
    () =>
      (universes ?? []).map((universe) => ({
        id: `universe-${universe}`,
        label: `Universe ${universe}`,
        icon: SlidersHorizontal,
        path: (p: number) => `/projects/${p}/channels/${universe}`,
        visibility: "active-only" as const,
        pathMatch: `/channels/${universe}`,
        group: "live" as const,
      })),
    [universes],
  )
}

/** Filter nav items based on whether the viewed project is the active one. */
export function filterNavItems(items: NavItem[], isViewingActiveProject: boolean): NavItem[] {
  return items.filter((item) => {
    if (item.visibility === "always") return true
    if (item.visibility === "active-only") return isViewingActiveProject
    if (item.visibility === "inactive-only") return !isViewingActiveProject
    return true
  })
}

import { useMemo } from "react"
import {
  Anchor,
  Braces,
  Sparkles,
  LayoutGrid,
  Layers,
  AudioWaveform,
  Gauge,
  BookOpenText,
  Box,
  Boxes,
  SlidersHorizontal,
  Theater,
  Play,
  Cloud,
  Settings,
  Computer,
  TableProperties,
  Sliders,
  SlidersVertical,
  SwatchBook,
  Activity,
  Users,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useAuthStatusQuery } from "./store/auth"
import { useGetUniverseQuery } from "./store/universes"
import { ATTRIBUTE_FAMILIES, FAMILY_LABELS, familySlug } from "./lib/attributeFamily"

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
  /**
   * Hidden from OPERATOR accounts. Set it wherever the destination's API is behind the
   * backend's admin gate (`ADMIN_ONLY_PREFIXES` / the per-project sync subtree in
   * `auth/AuthGate.kt`), so neither the sidebar nor Cmd+K offers a page that can only
   * answer 403. Not a permission check — the backend is that.
   */
  adminOnly?: boolean
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
    id: "looks",
    // The library entity cues layer and `ref:{uuid}` rows name — not the positional colour list
    // the busking bar calls a Colour List, which is now the only other thing called a palette.
    //
    // **One entry, one route**, unlike the four palette banks it replaces. Those were four
    // sibling routes with a sticky type, which is the exception CLAUDE.md documents for
    // Fixtures/Groups and the programmer's Values/FX — but it cannot work here: a Look's families
    // are *derived* from its rows, so one covering colour and position would have to live in two
    // routes at once. The library takes a sticky in-page family filter instead, and
    // `useLookFamilyNavItems` deep-links to it via `?family=`.
    label: "Looks",
    icon: SwatchBook,
    path: (p) => `/projects/${p}/looks`,
    visibility: "always",
    pathMatch: "/looks",
    group: "program",
  },
  {
    id: "speed-masters",
    // The tempo buses effects subscribe to. One entry, one route — no cards/list pair and no
    // type switcher, so none of the sibling-route exceptions in CLAUDE.md apply here.
    label: "Speed Masters",
    icon: Gauge,
    path: (p) => `/projects/${p}/speed-masters`,
    visibility: "always",
    pathMatch: "/speed-masters",
    group: "program",
  },

  // ── Live ────────────────────────────────────────────────────────────
  {
    id: "stage-view",
    label: "Stage",
    icon: Boxes,
    path: (p) => `/projects/${p}/stage`,
    visibility: "active-only",
    pathMatch: "/stage",
    group: "live",
  },
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
    // Program is the single cue/stack authoring + running surface (it absorbed the FX Cues view).
    // Scoped to the active project — running cues from Program needs the project live.
    label: "Program",
    icon: Theater,
    path: (p) => `/projects/${p}/program`,
    visibility: "active-only",
    pathMatch: "/program",
    group: "live",
  },
  {
    id: "programmer",
    // The busking / manual-override surface (Layer 2). Only the Values view is registered —
    // the FX sibling (`/programmer/fx`) is reached via the in-page switcher, matching the
    // cards/list exception documented in CLAUDE.md.
    label: "Programmer",
    icon: SlidersVertical,
    path: (p) => `/projects/${p}/programmer`,
    visibility: "active-only",
    pathMatch: "/programmer",
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
    id: "prompt-book",
    label: "Prompt Book",
    icon: BookOpenText,
    path: (p) => `/projects/${p}/prompt-book`,
    visibility: "active-only",
    pathMatch: "/prompt-book",
    group: "live",
  },
  {
    id: "channels",
    label: "Channels",
    icon: SlidersHorizontal,
    // No universe in the path: the route resolves the project's first patched universe
    // (rigs don't always start at 0).
    path: (p) => `/projects/${p}/channels`,
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
    label: "Regions",
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
  {
    id: "project-sync",
    label: "Sync",
    icon: Cloud,
    path: (p) => `/projects/${p}/settings/sync`,
    visibility: "always",
    pathMatch: "/settings/sync",
    group: "settings",
    parent: "project-settings",
    adminOnly: true,
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
    id: "users",
    label: "Users",
    icon: Users,
    path: () => "/install/users",
    visibility: "always",
    pathMatch: "/install/users",
    group: "install",
    parent: "install-settings",
    adminOnly: true,
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
    adminOnly: true,
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

/**
 * Returns one item per attribute family ("Colour Looks", "Position Looks", …).
 *
 * Cmd+K only, on the [useUniverseNavItems] precedent: the sidebar keeps its single "Looks" row and
 * the in-page filter moves between families, but jumping straight to the position bank is exactly
 * the kind of thing the command palette is for.
 *
 * These are **query params on one route**, not four routes — see the `looks` nav entry for why a
 * derived family cannot own a path. `pathMatch` is still the bare `/looks`, so the sidebar
 * highlights the one row whichever family you arrived in.
 */
export const lookFamilyNavItems: NavItem[] = ATTRIBUTE_FAMILIES.map((family) => ({
  // Prefixed rather than bare, so these can never collide with the static `looks` id.
  id: `looks-${familySlug(family)}`,
  label: `${FAMILY_LABELS[family].singular} Looks`,
  icon: SwatchBook,
  path: (p: number) => `/projects/${p}/looks?family=${familySlug(family)}`,
  visibility: "always" as const,
  // The bare path, not `/looks/${slug}` — see above. `navigation.test.ts` asserts this against
  // the real array, which is why the array is module-scope rather than built inside the hook.
  pathMatch: "/looks",
  group: "program" as const,
}))

export function useLookFamilyNavItems(): NavItem[] {
  return lookFamilyNavItems
}

/**
 * Whether admin-only nav items should be offered.
 *
 * Anything other than a resolved OPERATOR counts as admin: while `auth/status` is still
 * in flight, and on a bootstrap-open desk with no accounts at all, the API really is
 * reachable — hiding Sync from an admin for one round-trip would be the more visible bug,
 * and the backend refuses the call either way.
 */
export function useIsNavAdmin(): boolean {
  const { data } = useAuthStatusQuery()
  return data?.user?.role !== "OPERATOR"
}

/**
 * Filter nav items by project-activity visibility and, for [NavItem.adminOnly] entries,
 * by role. [isAdmin] defaults to true so callers that predate roles — and tests exercising
 * visibility alone — keep their existing behaviour.
 */
export function filterNavItems(
  items: NavItem[],
  isViewingActiveProject: boolean,
  isAdmin: boolean = true,
): NavItem[] {
  return items.filter((item) => {
    if (item.adminOnly && !isAdmin) return false
    if (item.visibility === "always") return true
    if (item.visibility === "active-only") return isViewingActiveProject
    if (item.visibility === "inactive-only") return !isViewingActiveProject
    return true
  })
}

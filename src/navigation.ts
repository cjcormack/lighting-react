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
  SlidersVertical,
  Theater,
  Cloud,
  Settings,
  Computer,
  TableProperties,
  Sliders,
  SwatchBook,
  Palette,
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
    // Named states over named fixtures, applied to a cue as layers. Every one is **recorded** — from
    // the programmer, or by promoting a selection — which is why the page has no New button.
    //
    // **One entry, one route, and no family filter.** The filter that used to live here moved to
    // `/templates` in session 3, where a family really is an exact partition; a Look spans families
    // by nature, so filtering by one would hide most of the library from most filters.
    label: "Looks",
    icon: SwatchBook,
    path: (p) => `/projects/${p}/looks`,
    visibility: "always",
    pathMatch: "/looks",
    group: "program",
  },
  {
    id: "templates",
    // Named values you build looks and cues out of: one attribute family each, no targets of their
    // own, applied to a selection. The other half of what `/looks` used to hold — see
    // `models/templates.kt` for why the two are separate entities rather than one with a flag.
    //
    // **One entry, one route, with a sticky family filter.** Sibling routes would now be legitimate
    // (a template is in exactly one family, so they would partition it exactly), and this is still
    // one route: the filter is a *view* of a small library rather than a division of it, and
    // `useTemplateFamilyNavItems` gives Cmd+K the four deep links as `?family=` params either way.
    label: "Templates",
    icon: Palette,
    path: (p) => `/projects/${p}/templates`,
    visibility: "always",
    pathMatch: "/templates",
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
    id: "programmer",
    // The programmer: values, layers and effects on ONE screen. It was a page, then three tabs of
    // a collapsed pane inside Program with no nav entry of its own, and is a page again — three
    // readings of one live object that could never be seen together is the problem that move
    // solved. The `/program` vs `/programmer` near-collision that argued against a second entry
    // last time went away when Program was renamed to Show.
    label: "Programmer",
    icon: SlidersVertical,
    path: (p) => `/projects/${p}/programmer`,
    visibility: "active-only",
    pathMatch: "/programmer",
    group: "live",
  },
  {
    // `id` stays "program" — it is the stable handle, and `navigation.test.ts` looks entries up by
    // it. Only the name, the path and the match moved.
    id: "program",
    // Show is the cue/stack authoring + running surface (it absorbed the FX Cues view). It was
    // called Program until the programmer moved out of it; two live views one letter apart was
    // exactly the collision that kept the programmer out of this list.
    // Scoped to the active project — running cues from here needs the project live.
    label: "Show",
    icon: Theater,
    path: (p) => `/projects/${p}/show`,
    visibility: "active-only",
    pathMatch: "/show",
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
 * Returns one item per attribute family ("Colour Templates", "Position Templates", …).
 *
 * Cmd+K only, on the [useUniverseNavItems] precedent: the sidebar keeps its single "Templates" row
 * and the in-page filter moves between families, but jumping straight to the position bank is exactly
 * the kind of thing the command palette is for.
 *
 * These moved here from `/looks` in session 3, following the filter itself. They are **query params
 * on one route**, not four routes, and `pathMatch` is the bare `/templates`, so the sidebar
 * highlights the one row whichever family you arrived in.
 */
export const templateFamilyNavItems: NavItem[] = ATTRIBUTE_FAMILIES.map((family) => ({
  // Prefixed rather than bare, so these can never collide with the static `templates` id.
  id: `templates-${familySlug(family)}`,
  label: `${FAMILY_LABELS[family].singular} Templates`,
  icon: Palette,
  path: (p: number) => `/projects/${p}/templates?family=${familySlug(family)}`,
  visibility: "always" as const,
  // The bare path, not `/templates/${slug}` — see above. `navigation.test.ts` asserts this against
  // the real array, which is why the array is module-scope rather than built inside the hook.
  pathMatch: "/templates",
  group: "program" as const,
}))

export function useTemplateFamilyNavItems(): NavItem[] {
  return templateFamilyNavItems
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

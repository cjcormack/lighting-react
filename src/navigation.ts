import {
  TableProperties,
  Braces,
  Sparkles,
  Spotlight,
  IterationCw,
  LayoutGrid,
  Layers,
  AudioWaveform,
  Bookmark,
  Clapperboard,
  SlidersHorizontal,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useGetUniverseQuery } from "./store/universes"

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  path: (projectId: number) => string
  /** Controls when this item is shown based on project status */
  visibility: "always" | "active-only" | "inactive-only"
  /** Used to match active state against the current pathname */
  pathMatch: string
}

/**
 * Shared navigation registry consumed by both the sidebar and command palette.
 * When adding a new page/route, add an entry here and it will automatically
 * appear in both the sidebar navigation and the Cmd+K command palette.
 */
export const navItems: NavItem[] = [
  {
    id: "patches",
    label: "Patch List",
    icon: TableProperties,
    path: (p) => `/projects/${p}/patches`,
    visibility: "always",
    pathMatch: "/patches",
  },
  {
    id: "scripts",
    label: "Scripts",
    icon: Braces,
    path: (p) => `/projects/${p}/scripts`,
    visibility: "always",
    pathMatch: "/scripts",
  },
  {
    id: "fx-library",
    label: "FX Library",
    icon: Sparkles,
    path: (p) => `/projects/${p}/fx-library`,
    visibility: "always",
    pathMatch: "/fx-library",
  },
  {
    id: "scenes",
    label: "Scenes",
    icon: Spotlight,
    path: (p) => `/projects/${p}/scenes`,
    visibility: "always",
    pathMatch: "/scenes",
  },
  {
    id: "chases",
    label: "Chases",
    icon: IterationCw,
    path: (p) => `/projects/${p}/chases`,
    visibility: "always",
    pathMatch: "/chases",
  },
  {
    id: "fixtures",
    label: "Fixtures",
    icon: LayoutGrid,
    path: (p) => `/projects/${p}/fixtures`,
    visibility: "active-only",
    pathMatch: "/fixtures",
  },
  {
    id: "groups",
    label: "Groups",
    icon: Layers,
    path: (p) => `/projects/${p}/groups`,
    visibility: "active-only",
    pathMatch: "/groups",
  },
  {
    id: "fx",
    label: "FX",
    icon: AudioWaveform,
    path: (p) => `/projects/${p}/fx`,
    visibility: "active-only",
    pathMatch: "/fx",
  },
  {
    id: "cues",
    label: "FX Cues",
    icon: Clapperboard,
    path: (p) => `/projects/${p}/cues`,
    visibility: "always",
    pathMatch: "/cues",
  },
  {
    id: "presets",
    label: "FX Presets",
    icon: Bookmark,
    path: (p) => `/projects/${p}/presets`,
    visibility: "always",
    pathMatch: "/presets",
  },
]

/** Returns the full list of nav items including dynamically-discovered universes. */
export function useNavItems(): NavItem[] {
  const { data: universes } = useGetUniverseQuery()

  const universeItems: NavItem[] = (universes ?? []).map((universe) => ({
    id: `universe-${universe}`,
    label: `Universe ${universe}`,
    icon: SlidersHorizontal,
    path: (p: number) => `/projects/${p}/channels/${universe}`,
    visibility: "active-only" as const,
    pathMatch: `/channels/${universe}`,
  }))

  return [...navItems, ...universeItems]
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

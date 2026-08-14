// @vitest-environment jsdom
// jsdom provides `window`, which navigation.ts pulls in transitively via
// store/universes → api/lightingApi (it reads window.location at import time).
import { describe, it, expect } from "vitest"
import { Box } from "lucide-react"
import { navItems, filterNavItems, type NavItem } from "./navigation"
import { PALETTE_TYPES, paletteTypeSlug } from "./lib/paletteTypes"

/** Minimal NavItem factory for exercising filterNavItems in isolation. */
function makeItem(id: string, visibility: NavItem["visibility"]): NavItem {
  return {
    id,
    label: id,
    icon: Box,
    path: (p) => `/projects/${p}/${id}`,
    visibility,
    pathMatch: `/${id}`,
    group: "live",
  }
}

describe("filterNavItems", () => {
  const items = [
    makeItem("always", "always"),
    makeItem("active", "active-only"),
    makeItem("inactive", "inactive-only"),
  ]

  it("keeps 'always' items regardless of active state", () => {
    expect(filterNavItems(items, true).map((i) => i.id)).toContain("always")
    expect(filterNavItems(items, false).map((i) => i.id)).toContain("always")
  })

  it("shows 'active-only' items only when viewing the active project", () => {
    expect(filterNavItems(items, true).map((i) => i.id)).toContain("active")
    expect(filterNavItems(items, false).map((i) => i.id)).not.toContain("active")
  })

  it("shows 'inactive-only' items only when NOT viewing the active project", () => {
    expect(filterNavItems(items, false).map((i) => i.id)).toContain("inactive")
    expect(filterNavItems(items, true).map((i) => i.id)).not.toContain("inactive")
  })

  it("preserves declaration order and does not mutate the input", () => {
    const before = items.map((i) => i.id)
    const result = filterNavItems(items, true)
    expect(result.map((i) => i.id)).toEqual(["always", "active"])
    expect(items.map((i) => i.id)).toEqual(before)
  })
})

describe("navItems registry", () => {
  it("has unique ids", () => {
    const ids = navItems.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("only references parents that exist", () => {
    const ids = new Set(navItems.map((i) => i.id))
    for (const item of navItems) {
      if (item.parent) expect(ids).toContain(item.parent)
    }
  })

  it("resolves project-scoped paths against the given project id", () => {
    for (const item of navItems) {
      const path = item.path(42)
      if (item.group === "install") {
        // Install-scope routes ignore the projectId arg.
        expect(path.startsWith("/install")).toBe(true)
      } else {
        expect(path).toContain("/projects/42")
      }
    }
  })

  // Guards the intent that Stage and Program are only reachable for the
  // active project (they used to be "always"). See the "live" group.
  it("scopes Stage and Program to the active project", () => {
    const stage = navItems.find((i) => i.id === "stage-view")
    const program = navItems.find((i) => i.id === "program")
    expect(stage?.visibility).toBe("active-only")
    expect(program?.visibility).toBe("active-only")
  })

  it("hides Stage/Program (and other active-only items) when viewing a non-active project", () => {
    const ids = filterNavItems(navItems, false).map((i) => i.id)
    expect(ids).not.toContain("stage-view")
    expect(ids).not.toContain("program")
    // Sanity: always-visible items survive the same filter.
    expect(ids).toContain("scripts")
    expect(ids).toContain("install-settings")
  })
})

describe("palette navigation", () => {
  it("registers exactly one Palettes entry, on the bare path", () => {
    const palettes = navItems.filter((i) => i.pathMatch.startsWith("/palettes"))
    expect(palettes.map((i) => i.id)).toEqual(["palettes"])
    expect(palettes[0].pathMatch).toBe("/palettes")
  })

  it("registers no per-type entry in the sidebar registry", () => {
    // The four type routes are sibling views reached through the in-page switcher — the same
    // exception the cards/list pair and the programmer's Values/FX make. A second sidebar row
    // per type would put five Palettes entries in a nine-item group.
    expect(navItems.filter((i) => i.pathMatch.includes("/palettes/"))).toEqual([])
  })

  it("gives the Cmd+K per-type items ids that can't collide with the sidebar entry", () => {
    // `usePaletteTypeNavItems` is a hook, but its items are static — build the ids the same way
    // it does rather than rendering, so this stays a plain unit test.
    const ids = PALETTE_TYPES.map((type) => `palettes-${paletteTypeSlug(type)}`)
    expect(new Set(ids).size).toBe(ids.length)
    const staticIds = new Set(navItems.map((i) => i.id))
    for (const id of ids) expect(staticIds.has(id)).toBe(false)
  })
})

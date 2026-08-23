// @vitest-environment jsdom
// jsdom provides `window`, which navigation.ts pulls in transitively via
// store/universes → api/lightingApi (it reads window.location at import time).
import { describe, it, expect } from "vitest"
import { Box } from "lucide-react"
import { navItems, templateFamilyNavItems, filterNavItems, type NavItem } from "./navigation"
import { ATTRIBUTE_FAMILIES, familySlug } from "./lib/attributeFamily"

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

describe("admin-only navigation", () => {
  // Every entry whose destination is behind the backend's admin gate
  // (ADMIN_ONLY_PREFIXES / the per-project sync subtree in lighting7's auth/AuthGate.kt).
  const adminOnlyIds = ["users", "sync", "project-sync"]

  it("marks the entries whose APIs are admin-gated", () => {
    for (const id of adminOnlyIds) {
      expect(navItems.find((i) => i.id === id)?.adminOnly).toBe(true)
    }
  })

  it("hides them from operators and keeps everything else", () => {
    const ids = filterNavItems(navItems, true, false).map((i) => i.id)
    for (const id of adminOnlyIds) expect(ids).not.toContain(id)
    // The parent they hang off stays: an operator can still read install settings.
    expect(ids).toContain("install-settings")
    expect(ids).toContain("diagnostics")
  })

  it("shows them to admins, and to callers that don't pass a role at all", () => {
    const asAdmin = filterNavItems(navItems, true, true).map((i) => i.id)
    const roleUnknown = filterNavItems(navItems, true).map((i) => i.id)
    for (const id of adminOnlyIds) {
      expect(asAdmin).toContain(id)
      expect(roleUnknown).toContain(id)
    }
  })
})

describe("look and template navigation", () => {
  it("registers exactly one Looks entry, on the bare path", () => {
    const looks = navItems.filter((i) => i.pathMatch.startsWith("/looks"))
    expect(looks.map((i) => i.id)).toEqual(["looks"])
    expect(looks[0].pathMatch).toBe("/looks")
  })

  it("registers no per-family route in the sidebar registry", () => {
    // A Look's families are *derived* and one may span several, so a family cannot own a path at
    // all — the library takes one route with an in-page filter. Anything matching `/looks/`
    // here would be a sub-route that cannot exist.
    expect(navItems.filter((i) => i.pathMatch.includes("/looks/"))).toEqual([])
  })

  it("gives the Cmd+K per-family items ids that can't collide with the sidebar entry", () => {
    // Asserted against the real array, not against ids rebuilt here: an assertion that
    // reconstructs what it is checking passes just as happily when the source is wrong.
    const ids = templateFamilyNavItems.map((i) => i.id)
    expect(ids).toEqual(ATTRIBUTE_FAMILIES.map((family) => `templates-${familySlug(family)}`))
    expect(new Set(ids).size).toBe(ids.length)
    const staticIds = new Set(navItems.map((i) => i.id))
    for (const id of ids) expect(staticIds.has(id)).toBe(false)
  })

  it("keeps the family deep links on the one route, as query params", () => {
    // They are `?family=` on `/templates`, not `/templates/colour`. `pathMatch` therefore stays the
    // bare path so the sidebar highlights its single row whichever family you arrived in — which is
    // what the second half of this pins.
    //
    // The filter and these links moved here from `/looks` in session 3, following the argument that
    // justifies one: a template is in exactly one family, so a family is an exact partition, while a
    // Look spans families and would be hidden from most filters.
    expect(templateFamilyNavItems).toHaveLength(ATTRIBUTE_FAMILIES.length)
    for (const [index, family] of ATTRIBUTE_FAMILIES.entries()) {
      const item = templateFamilyNavItems[index]
      expect(item.path(1)).toBe(`/projects/1/templates?family=${familySlug(family)}`)
      expect(item.pathMatch).toBe("/templates")
    }
  })

  it("gives Looks and Templates separate entries that can't shadow each other", () => {
    // The two libraries are two entities, and their paths are siblings — `/looks` must not match a
    // template route or vice versa. `lib/navMatch.test.ts` pins the matcher itself.
    const looks = navItems.find((i) => i.id === "looks")
    const templates = navItems.find((i) => i.id === "templates")
    expect(looks?.pathMatch).toBe("/looks")
    expect(templates?.pathMatch).toBe("/templates")
    expect(looks?.path(1)).toBe("/projects/1/looks")
    expect(templates?.path(1)).toBe("/projects/1/templates")
  })

  it("gives the programmer and Show separate entries that can't shadow each other", () => {
    // A `programmer` entry was left out of the sidebar once because `/program` and `/programmer`
    // would have collided. Renaming Program to Show removed the collision; these two assertions and
    // `lib/navMatch.test.ts` are what keep it removed.
    const programmer = navItems.find((i) => i.id === "programmer")
    const show = navItems.find((i) => i.id === "program")
    expect(programmer?.pathMatch).toBe("/programmer")
    expect(programmer?.path(7)).toBe("/projects/7/programmer")
    expect(show?.label).toBe("Show")
    expect(show?.pathMatch).toBe("/show")
    expect(show?.path(7)).toBe("/projects/7/show")
    // Neither pathMatch may be a whole-segment suffix of the other.
    expect(programmer!.pathMatch.endsWith(show!.pathMatch)).toBe(false)
  })
})

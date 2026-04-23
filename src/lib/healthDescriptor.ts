import type { BindingHealth } from "@/api/surfacesApi"

/**
 * Operator-facing reason string for a dead health status. Accepts the superset
 * [BindingHealth]; cue-authoring's 4-variant `AssignmentHealth` is structurally a subset,
 * so its values pass through this function unchanged.
 *
 * Kept separate from chip / banner rendering so it can be reused in tooltips, banner
 * items, and binding rows.
 */
export function describeHealth(health: BindingHealth | undefined): string | null {
  if (!health || health.type === "ok") return null
  switch (health.type) {
    case "missingFixture":
      return `Fixture '${health.fixtureKey}' no longer exists`
    case "missingGroup":
      return `Group '${health.groupName}' no longer exists`
    case "missingProperty":
      return `Property '${health.propertyName}' is not defined on '${health.targetKey}'`
    case "missingStack":
      return `Cue stack #${health.stackId} no longer exists`
    case "missingCue":
      return `Cue #${health.cueId} no longer exists`
    case "unknownBank":
      return `Bank '${health.bankId}' is not defined on device '${health.deviceTypeKey}'`
  }
}

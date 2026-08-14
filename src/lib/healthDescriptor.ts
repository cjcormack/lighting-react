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
    case "missingPalette":
      return "The palette this references no longer exists"
    case "missingPaletteEntry":
      return `The referenced palette has no ${health.propertyName} for '${health.targetKey}'`
    case "paletteTypeMismatch":
      return `A ${health.paletteType.toLowerCase()} palette can't cover a ${health.propertyGroup.toLowerCase()} property`
    case "missingStack":
      return `Cue stack #${health.stackId} no longer exists`
    case "missingCue":
      return `Cue #${health.cueId} no longer exists`
    case "unknownBank":
      return `Bank '${health.bankId}' is not defined on device '${health.deviceTypeKey}'`
    case "missingSpeedMaster":
      // Unlike an effect, which degrades to master 1, a dead tempo binding does nothing —
      // silently retuning the global tempo instead would be worse than being visibly dead.
      return "The speed master this controls no longer exists"
    default:
      // Not dead code: the backend's health ADT is versioned independently of this client, so
      // a newer server can send a variant TypeScript here has never heard of. Falling through
      // to a generic message keeps an unknown variant *visible* as a problem, which is the
      // point of the diagnostic — returning null would render it as healthy.
      return "This reference no longer resolves"
  }
}

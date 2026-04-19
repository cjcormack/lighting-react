import type {
  BindingTarget,
  ControlDescriptor,
  ControlSurfaceType,
} from "@/store/surfaces"

/** Flash targets wrap an inner continuous target; return the meaningful target. */
export function effectiveTarget(target: BindingTarget): BindingTarget {
  return target.type === "flash" ? target.target : target
}

export type BindingTargetMatcher =
  | { type: "fixtureProperty"; fixtureKey: string; propertyName: string }
  | { type: "groupProperty"; groupName: string; propertyName: string }
  | { type: "fireCue"; cueId: number }
  | { type: "cueStack"; stackId: number }

export function matchesBindingTarget(
  target: BindingTarget,
  match: BindingTargetMatcher,
): boolean {
  const eff = effectiveTarget(target)
  switch (match.type) {
    case "fixtureProperty":
      return (
        eff.type === "fixtureProperty" &&
        eff.fixtureKey === match.fixtureKey &&
        eff.propertyName === match.propertyName
      )
    case "groupProperty":
      return (
        eff.type === "groupProperty" &&
        eff.groupName === match.groupName &&
        eff.propertyName === match.propertyName
      )
    case "fireCue":
      return eff.type === "fireCue" && eff.cueId === match.cueId
    case "cueStack":
      return (
        (eff.type === "cueStackGo" ||
          eff.type === "cueStackBack" ||
          eff.type === "cueStackPause") &&
        eff.stackId === match.stackId
      )
  }
}

export function describeTarget(target: BindingTarget): string {
  switch (target.type) {
    case "fixtureProperty":
      return `${target.fixtureKey}.${target.propertyName}`
    case "groupProperty":
      return `${target.groupName}.${target.propertyName}`
    case "cueStackGo":
      return `Go · stack ${target.stackId}`
    case "cueStackBack":
      return `Back · stack ${target.stackId}`
    case "cueStackPause":
      return `Pause · stack ${target.stackId}`
    case "fireCue":
      return `Fire cue #${target.cueId}`
    case "flash":
      return `Flash ${describeTarget(target.target)}`
    case "blackout":
      return "Blackout"
    case "grandMasterToggle":
      return "Grand Master"
    case "setBank":
      return `Bank ${target.bank} (${target.deviceTypeKey})`
  }
}

/** Look up the human label for a control on a given device profile. */
export function controlLabel(
  profile: ControlSurfaceType | null | undefined,
  controlId: string,
): string {
  return profile?.controls.find((c: ControlDescriptor) => c.controlId === controlId)?.label ?? controlId
}

/** `"x-touch-compact-standard"` → `"XT"`. Used for chip abbreviations. */
export function shortDeviceLabel(typeKey: string): string {
  const parts = typeKey.split("-").filter((p) => p.length > 0)
  if (parts.length === 0) return typeKey.slice(0, 3).toUpperCase()
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("")
}

import type { IncludedTarget } from '@/api/programmerWsApi'

/**
 * Operator-facing label for whatever Include last loaded.
 *
 * One helper rather than three call sites formatting it themselves: the toolbar tooltip, the Update
 * dialog title and the collapsed programmer pane all name the same thing, and they drifted the
 * moment palettes were added as a second kind.
 */
export function describeIncludedTarget(target: IncludedTarget): string {
  if (target.kind === 'PALETTE') {
    const name = target.paletteName ?? `Palette ${target.paletteId}`
    return target.paletteType ? `${name} (${target.paletteType.toLowerCase()} palette)` : name
  }
  const label = [target.cueNumber, target.cueName].filter(Boolean).join(' · ')
  return label || `Cue ${target.cueId}`
}

/**
 * A stable key for the include target, used by `UpdateDialog`'s once-per-run guard.
 *
 * Three distinct shapes — `B`, `A:C:{id}`, `A:P:{id}` — so flipping between a cue target, a palette
 * target and the checklist each re-arms the dialog. Keying on `open` alone previously left Mode B
 * showing no checklist and a permanently disabled button; the same class of bug is reachable when a
 * palette target is cleared from another tab.
 */
export function includedTargetKey(target: IncludedTarget | null): string {
  if (target == null) return 'B'
  return target.kind === 'PALETTE' ? `A:P:${target.paletteId}` : `A:C:${target.cueId}`
}

/** The cue id when a cue is included, else null. Narrows the union at read sites. */
export function includedCueId(target: IncludedTarget | null): number | null {
  return target?.kind === 'CUE' ? target.cueId : null
}

import type { IncludedTarget } from '@/api/programmerWsApi'

/**
 * Operator-facing label for whatever Include last loaded.
 *
 * One helper rather than three call sites formatting it themselves: the toolbar tooltip, the Update
 * dialog title and the collapsed programmer pane all name the same thing, and they drifted the
 * moment a second kind was added.
 */
export function describeIncludedTarget(target: IncludedTarget): string {
  if (target.kind === 'LOOK') {
    return target.lookName ?? `Look ${target.lookId}`
  }
  if (target.kind === 'PALETTE') {
    // Unreachable from this client — nothing includes a palette any more — but the arm is still on
    // the wire, so a stale target from another client still gets a name rather than "Cue undefined".
    return target.paletteName ?? `Palette ${target.paletteId}`
  }
  const label = [target.cueNumber, target.cueName].filter(Boolean).join(' · ')
  return label || `Cue ${target.cueId}`
}

/**
 * A stable key for the include target, used by `UpdateDialog`'s once-per-run guard.
 *
 * One shape per kind — `B`, `A:C:{id}`, `A:L:{id}`, `A:P:{id}` — so flipping between a cue target,
 * a Look target and the checklist each re-arms the dialog. Keying on `open` alone previously left
 * Mode B showing no checklist and a permanently disabled button; the same class of bug is reachable
 * when a target is cleared from another tab.
 */
export function includedTargetKey(target: IncludedTarget | null): string {
  if (target == null) return 'B'
  if (target.kind === 'LOOK') return `A:L:${target.lookId}`
  if (target.kind === 'PALETTE') return `A:P:${target.paletteId}`
  return `A:C:${target.cueId}`
}

/**
 * True when Update cannot write back to this target.
 *
 * A Look include is one-way: the write-back path still targets the retired palette tables, so
 * offering Update would report success and write rows no consumer reads. The button is disabled
 * with that reason rather than hidden, because the operator needs to know the Include *worked*.
 */
export function includedTargetIsReadOnly(target: IncludedTarget | null): boolean {
  return target?.kind === 'LOOK'
}

/** The cue id when a cue is included, else null. Narrows the union at read sites. */
export function includedCueId(target: IncludedTarget | null): number | null {
  return target?.kind === 'CUE' ? target.cueId : null
}

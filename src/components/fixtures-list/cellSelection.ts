/**
 * The look of a selected cell.
 *
 * A **fill**, deliberately never another ring colour. `ownership.ts` owns a six-value ring
 * vocabulary — parked, programmer touched/untouched, effect, cue, baseline — that an operator has
 * to be able to read at a glance in a blacked-out room, and a seventh ring would compete with all
 * six. Selection is a different kind of fact anyway: it says "these are what your next edit hits",
 * not "this is who owns the value", so it wants a different *kind* of affordance rather than a
 * different hue.
 *
 * Applied as an `::after` overlay so it layers over whatever `ownershipCellClass` produced without
 * either one having to know about the other.
 */
export function cellSelectionClass(selected: boolean): string {
  return selected
    ? 'after:pointer-events-none after:absolute after:inset-0 after:rounded-sm after:bg-primary/20 after:ring-1 after:ring-inset after:ring-primary'
    : ''
}

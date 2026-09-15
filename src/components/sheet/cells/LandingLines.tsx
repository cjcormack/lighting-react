/**
 * The batch's landing, **one row to a line**, with the problem under it.
 *
 * A list rather than a `·`-joined sentence: this is the last thing read before Apply on a surface
 * whose whole point is that the operator can see where every head is about to go, and eight of
 * them run together into a wrapped paragraph is the shape that is hardest to scan. Shared by the
 * address editor (`AddressCell`) and the Key column's (`TextCell`), so the two previews read alike.
 *
 * It scrolls rather than growing without limit: a marquee down a long patch list can name dozens of
 * heads, and a popover that outgrows the viewport is one whose Apply button cannot be reached.
 */
export function LandingLines({ lines, error }: { lines: readonly string[]; error: string | null }) {
  return (
    <div className="space-y-1 border-t pt-2">
      <ul className="max-h-40 space-y-0.5 overflow-y-auto font-mono text-[11px] tabular-nums text-muted-foreground">
        {lines.map((line, i) => (
          // Index keys: the list is regenerated whole on every keystroke and never reordered, and
          // two heads of the same name can produce the same line.
          <li key={i} className="truncate" title={line}>
            {line}
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

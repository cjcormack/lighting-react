import { memo } from 'react'
import { ColourPickerPopover } from '../../fixtures/ColourPickerPopover'
import type { CellResolution } from '../columns'
import type { CellCommit } from '../rowModel'
import type { CellValue } from '../useRowValues'

interface ColourCellProps {
  value: Extract<CellValue, { kind: 'colour' }>
  resolutions: NonNullable<CellResolution>[]
  batchCount: number
  onCommit: (commit: CellCommit) => void
  onBeginEdit: () => void
}

/**
 * Swatch + RGB readout; a non-uniform group shows a "Mixed" badge over the
 * averaged swatch. Editing reuses ColourPickerPopover (pure props) — every
 * change commits immediately, which is the app's live-edit convention.
 */
export const ColourCell = memo(function ColourCell({
  value,
  resolutions,
  batchCount,
  onCommit,
  onBeginEdit,
}: ColourCellProps) {
  // A member "has" an extended channel when any backing colour property does —
  // the picker then offers the slider, and members without the channel skip it
  // at write time.
  const hasWhite = resolutions.some((r) => r.kind === 'colour' && r.property.whiteChannel)
  const hasAmber = resolutions.some((r) => r.kind === 'colour' && r.property.amberChannel)
  const hasUv = resolutions.some((r) => r.kind === 'colour' && r.property.uvChannel)

  return (
    <ColourPickerPopover
      r={value.r}
      g={value.g}
      b={value.b}
      w={value.w}
      a={value.a}
      uv={value.uv}
      combinedCss={value.combinedCss}
      hasWhiteChannel={hasWhite}
      hasAmberChannel={hasAmber}
      hasUvChannel={hasUv}
      onColourChange={(r, g, b, w, a, uv) => onCommit({ kind: 'colour', r, g, b, w, a, uv })}
    >
      <button
        type="button"
        onClick={onBeginEdit}
        className="flex h-full w-full items-center gap-1.5 rounded px-1.5 text-left hover:bg-accent/50"
        title={batchCount > 1 ? `Applying to ${batchCount} targets` : undefined}
      >
        {/* A `Link2` glyph used to sit on top of this swatch when the cell's entries held a
            `ref:{uuid}`, and the palette's *name* replaced the RGB readout below when the row
            agreed on one colour. Both went with the `ref:` grammar in session 4; a cell lit by a
            Look layer is marked by the `Layers` corner glyph in `FixturesTable` instead, which is
            about composition rather than about the operator's own entry. */}
        <span
          className="size-4 shrink-0 overflow-hidden rounded-sm border border-border"
          style={{ backgroundColor: value.combinedCss }}
        />
        <span className="truncate text-xs tabular-nums text-muted-foreground">
          {value.isUniform ? `${value.r},${value.g},${value.b}` : 'Mixed'}
        </span>
      </button>
    </ColourPickerPopover>
  )
})

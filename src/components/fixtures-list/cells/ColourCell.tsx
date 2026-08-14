import { memo } from 'react'
import { Link2 } from 'lucide-react'
import { ColourPickerPopover } from '../../fixtures/ColourPickerPopover'
import { PaletteRefNotice } from './PaletteRefNotice'
import type { CellResolution } from '../columns'
import type { CellPaletteRef } from '../useRowOwnership'
import type { CellCommit } from '../rowModel'
import type { CellValue } from '../useRowValues'

interface ColourCellProps {
  value: Extract<CellValue, { kind: 'colour' }>
  resolutions: NonNullable<CellResolution>[]
  batchCount: number
  /** Set when this cell's programmer entries reference a named palette. */
  paletteRef?: CellPaletteRef
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
  paletteRef,
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
      notice={<PaletteRefNotice paletteRef={paletteRef} />}
    >
      <button
        type="button"
        onClick={onBeginEdit}
        className="flex h-full w-full items-center gap-1.5 rounded px-1.5 text-left hover:bg-accent/50"
        title={batchCount > 1 ? `Applying to ${batchCount} targets` : undefined}
      >
        {/* Resolved colour with the reference glyph on top of it, the idiom
            `FxColourListPicker` already uses for `P1`. The drop-shadow is load-bearing rather
            than decorative: a white glyph on an arbitrary palette colour is otherwise
            illegible, and a pale palette is exactly the case that matters. */}
        <span
          className="relative size-4 shrink-0 overflow-hidden rounded-sm border border-border"
          style={{ backgroundColor: value.combinedCss }}
        >
          {paletteRef && (
            <Link2 className="absolute inset-0 m-auto size-2.5 text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
          )}
        </span>
        {/* The name only replaces the readout when the row genuinely agrees on one colour.
            `paletteRef.mixed` is about palette *identity*; a single palette still resolves per
            fixture, so a row can reference one palette and hold three different colours — and
            printing its name there would hide from the operator that Record is about to capture
            three different literals. */}
        <span className="truncate text-xs tabular-nums text-muted-foreground">
          {paletteRef && !paletteRef.mixed && paletteRef.name && value.isUniform
            ? paletteRef.name
            : value.isUniform
              ? `${value.r},${value.g},${value.b}`
              : 'Mixed'}
        </span>
      </button>
    </ColourPickerPopover>
  )
})

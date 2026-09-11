import { memo } from 'react'
import { ColourPickerPopover } from '../../fixtures/ColourPickerPopover'
import type { CellResolution } from '../columns'
import type { CellCommit } from '../rowModel'
import type { CellValue } from '../useRowValues'
import { useCellEditorCramped, type CellClickBehaviour } from './CellEditorSurface'
import { UNSET_CELL_TITLE, UnsetCellMark } from './UnsetCellMark'
import { useCellEditorOpen } from './useCellEditorOpen'

interface ColourCellOwnProps {
  value: Extract<CellValue, { kind: 'colour' }>
  resolutions: NonNullable<CellResolution>[]
  /** The column's name, titling the editor where it is a bottom sheet. See `SliderCell`. */
  label?: string
  batchCount: number
  /** No value in the current scope — see `UnsetCellMark`. */
  placeholder?: boolean
  /**
   * The cell cannot take an edit — the desk is unreachable, so the write would go nowhere.
   * A real `disabled` rather than the wrapper's `pointer-events-none` alone: that stops the
   * mouse and not the keyboard, and this trigger is tabbable.
   */
  disabled?: boolean
  /**
   * A released single-column marquee named this cell: open the editor without a click.
   * See `useCellEditorOpen`.
   */
  autoOpen?: boolean
  /** The container asked this editor to close — Set pressed again. See `useCellEditorOpen`. */
  autoClose?: boolean
  /** That open came from the bar's Set, so the editor is anchored there. See `useCellEditorOpen`. */
  anchorAtButton?: boolean
  /**
   * The auto-open came from a character typed at the grid, which lands in the R box as its first
   * keystroke. Focus is not its business — R is focused however the editor was opened. See
   * `useCellEditorKeyboard`.
   */
  keyboardSeed?: string | null
  /**
   * Nothing is selected any more, so this editor's targets are gone with it — close.
   * See `useCellEditorOpen`.
   */
  selectionEmpty?: boolean
  onCommit: (commit: CellCommit) => void
  onBeginEdit: () => void
}

type ColourCellProps = ColourCellOwnProps & CellClickBehaviour

/**
 * Swatch + RGB readout; a non-uniform group shows a "Mixed" badge over the
 * averaged swatch. Editing reuses ColourPickerPopover (pure props), through the shared
 * cell-editor surface — every change commits immediately, which is the app's live-edit
 * convention.
 */
export const ColourCell = memo(function ColourCell({
  value,
  resolutions,
  label = 'Colour',
  batchCount,
  placeholder,
  disabled = false,
  autoOpen,
  autoClose,
  anchorAtButton,
  keyboardSeed,
  selectionEmpty,
  clickSelects,
  editorAnchorRef,
  onCommit,
  onBeginEdit,
}: ColourCellProps) {
  // Driven from here so the container's request (Enter over a selection, or the bar's Set) can
  // open it: the picker keeps its own state when no `open` is passed, and the other two call
  // sites still leave it to.
  const { isOpen, setOpen, keyboardOpen, atButton } = useCellEditorOpen({
    autoOpen,
    autoClose,
    anchorAtButton,
    keyboardSeed,
    disabled,
    selectionEmpty,
  })
  // The colour editor is the only one of the four tall enough to run out of room, so it alone has
  // a compact layout. Keyed on the viewport's **height** rather than on which form it is in: a
  // short desktop window is still a popover, and there the full layout clips off the top of the
  // screen with nothing said. Asked here rather than inside the picker, because the picker has two
  // other callers that are not cell editors at all. It reads the same shared store
  // `CellEditorSurface` uses, so this is a Set entry and not a second `matchMedia`.
  const compact = useCellEditorCramped()
  // A member "has" an extended channel when any backing colour property does —
  // the picker then offers the slider, and members without the channel skip it
  // at write time.
  const hasWhite = resolutions.some((r) => r.kind === 'colour' && r.property.whiteChannel)
  const hasAmber = resolutions.some((r) => r.kind === 'colour' && r.property.amberChannel)
  const hasUv = resolutions.some((r) => r.kind === 'colour' && r.property.uvChannel)

  return (
    <ColourPickerPopover
      open={isOpen}
      onOpenChange={setOpen}
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
      // The grid cell's only editor, so this is where the typed R/G/B and emitter boxes belong
      // (`PD-COLOUR-EDITOR-INPUTS`). The two property visualizers leave it off: they draw their own
      // channel bank beside the swatch already.
      channelFields
      // Same reasoning, same two exempt callers: a grid cell's editor has nowhere good to float on
      // a portrait phone, and the two property visualizers do. See `sheetWhenNarrow`.
      sheetWhenNarrow
      title={label}
      compact={compact}
      // R is focused on open and Enter closes; a character typed at the grid arrives there as its
      // first keystroke, which is all this carries. See `useCellEditorKeyboard`.
      keyboardOpen={keyboardOpen}
      // This cell's button already carried the click, so unlike the other three there is nothing
      // to add here beyond telling the surface to stop opening on it. See `CellClickBehaviour`.
      triggerOpens={!clickSelects}
      // Only where the press was made — the bar's Set; see the other three cells.
      editorAnchorRef={atButton ? editorAnchorRef : undefined}
      onColourChange={(r, g, b, w, a, uv) => onCommit({ kind: 'colour', r, g, b, w, a, uv })}
    >
      <button
        type="button"
        disabled={disabled}
        // **The whole of what a click does, in every mode.** Where a click selects, the trigger
        // is only an anchor and `onOpenChange` never sees a `true`; where it opens the editor
        // (the two plain list routes) it fires alongside that open, which is where this used to
        // live. Unconditional, and identical in all four cells, because the alternative was two
        // mechanisms for one contract — `ColourCell` already did it this way, and a fifth cell
        // modelled on either half could have double-fired or missed. See `CellClickBehaviour`.
        onClick={onBeginEdit}
        className="flex h-full w-full items-center gap-1.5 rounded text-left hover:bg-accent/50"
        title={
          placeholder
            ? UNSET_CELL_TITLE
            : batchCount > 1
              ? `Applying to ${batchCount} targets`
              : undefined
        }
      >
        {/* A `Link2` glyph used to sit on top of this swatch when the cell's entries held a
            `ref:{uuid}`, and the palette's *name* replaced the RGB readout below when the row
            agreed on one colour. Both went with the `ref:` grammar in session 4; a cell lit by a
            Look layer is marked by the `Layers` corner glyph in `FixturesTable` instead, which is
            about composition rather than about the operator's own entry. */}
        {placeholder ? (
          <UnsetCellMark />
        ) : (
          <>
            <span
              className="ml-1.5 size-4 shrink-0 overflow-hidden rounded-sm border border-border"
              style={{ backgroundColor: value.combinedCss }}
            />
            <span className="mr-1.5 truncate text-xs tabular-nums text-muted-foreground">
              {value.isUniform ? `${value.r},${value.g},${value.b}` : 'Mixed'}
            </span>
          </>
        )}
      </button>
    </ColourPickerPopover>
  )
})

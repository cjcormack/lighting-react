import { memo, useCallback, useEffect, useRef } from 'react'
import { useNumberFieldDraft } from '@/hooks/useNumberFieldDraft'
import type { CellResolution } from '../columns'
import type { CellCommit } from '../rowModel'
import type { CellValue } from '../useRowValues'
import { CellEditorSurface, type CellClickBehaviour } from './CellEditorSurface'
import { UNSET_CELL_TITLE, UnsetCellMark } from './UnsetCellMark'
import { numericSeed, useCellEditorKeyboard } from './useCellEditorKeyboard'
import { useCellEditorOpen } from './useCellEditorOpen'
import { ValueFieldRow } from './ValueFieldRow'

interface PositionCellOwnProps {
  value: Extract<CellValue, { kind: 'position' }>
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
   * The auto-open came from a character typed at the grid, which lands in Pan as its first
   * keystroke. Focus is not its business — Pan is focused however the editor was opened. See
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

type PositionCellProps = PositionCellOwnProps & CellClickBehaviour

/**
 * Mini crosshair pad + pan/tilt readout; edit via pan/tilt sliders **and typed fields** in the
 * shared cell-editor surface, committing continuously. Writes drive the coarse channels only
 * (fine channels fold into the column and are left untouched).
 *
 * The two fields are what `pan,tilt` used to be: the deleted typed-value popover could take a
 * position as one line of text, and this editor could not take one at all — only a drag. So the
 * pair came here, as the *gesture* rather than the grammar: Pan is focused when the editor is
 * opened from the keyboard, comma steps to Tilt, Enter is done.
 */
export const PositionCell = memo(function PositionCell({
  value,
  resolutions,
  label = 'Position',
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
}: PositionCellProps) {
  const first = resolutions[0]
  const ranges =
    first.kind === 'position'
      ? { panMin: first.panMin, panMax: first.panMax, tiltMin: first.tiltMin, tiltMax: first.tiltMax }
      : { panMin: 0, panMax: 255, tiltMin: 0, tiltMax: 255 }

  // Per-axis, exactly as the sliders are: sending the row's aggregate for the axis that did not
  // move would overwrite every batch target's value for it with one number.
  const commitPan = useCallback(
    (raw: number) =>
      onCommit({
        kind: 'position',
        pan: Math.max(ranges.panMin, Math.min(ranges.panMax, Math.round(raw))),
      }),
    [onCommit, ranges.panMin, ranges.panMax],
  )
  const commitTilt = useCallback(
    (raw: number) =>
      onCommit({
        kind: 'position',
        tilt: Math.max(ranges.tiltMin, Math.min(ranges.tiltMax, Math.round(raw))),
      }),
    [onCommit, ranges.tiltMin, ranges.tiltMax],
  )
  // `useNumberFieldDraft` owns the "an emptied box must not commit" rule; the clamp above stays
  // here, because a position's bounds come from its resolution rather than being a flat byte.
  const panDraft = useNumberFieldDraft(String(value.pan), commitPan)
  const tiltDraft = useNumberFieldDraft(String(value.tilt), commitTilt)
  const resetDrafts = useCallback(() => {
    panDraft.reset()
    tiltDraft.reset()
  }, [panDraft, tiltDraft])

  // Controlled, because the container has to be able to open this from outside — Enter over a
  // selection, or the bar's Set — which an uncontrolled Radix popover offers no door for.
  const { isOpen, setOpen, keyboardOpen, atButton } = useCellEditorOpen({
    autoOpen,
    autoClose,
    anchorAtButton,
    keyboardSeed,
    disabled,
    selectionEmpty,
    onOpen: resetDrafts,
  })
  const { contentRef, onKeyDown, onOpenAutoFocus } = useCellEditorKeyboard({
    onDone: () => setOpen(false),
  })
  // The character that opened the editor lands in Pan as though it had been typed there. Through a
  // ref so the effect depends on the open alone — see `SliderCell`, which does the same.
  const panDraftRef = useRef(panDraft)
  panDraftRef.current = panDraft
  useEffect(() => {
    const seed = numericSeed(keyboardOpen)
    if (seed) panDraftRef.current.onChange(seed)
  }, [keyboardOpen])

  return (
    <CellEditorSurface
      open={isOpen}
      onOpenChange={setOpen}
      title={label}
      contentClassName="w-64"
      onOpenAutoFocus={onOpenAutoFocus}
      triggerOpens={!clickSelects}
      // Only where the press was made — the bar's Set. Enter and a typed character are gestures
      // made at the selection, so their editor opens beside the cell.
      anchorRef={atButton ? editorAnchorRef : undefined}
      trigger={
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
          title={placeholder ? UNSET_CELL_TITLE : undefined}
        >
          {placeholder ? (
            <UnsetCellMark />
          ) : (
            <>
              <span className="relative ml-1.5 size-4 shrink-0 rounded-sm border border-border bg-muted/50">
                <span
                  className="absolute size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
                  style={{
                    left: `${value.panNormalized * 100}%`,
                    top: `${(1 - value.tiltNormalized) * 100}%`,
                  }}
                />
              </span>
              <span className="mr-1.5 truncate text-xs tabular-nums text-muted-foreground">
                {value.isUniform ? `${value.pan},${value.tilt}` : 'Mixed'}
              </span>
            </>
          )}
        </button>
      }
    >
      {/* The wrapper is the editor's keyboard: Enter closes, comma steps Pan → Tilt, and a
          keyboard-opened editor focuses Pan. See `useCellEditorKeyboard`. */}
      <div ref={contentRef} onKeyDown={onKeyDown} className="space-y-3">
        {batchCount > 1 && (
          <p className="text-xs text-muted-foreground">Applying to {batchCount} targets</p>
        )}
        <ValueFieldRow
          label="Pan"
          min={ranges.panMin}
          max={ranges.panMax}
          value={value.pan}
          draft={panDraft}
          onSlide={commitPan}
        />
        <ValueFieldRow
          label="Tilt"
          min={ranges.tiltMin}
          max={ranges.tiltMax}
          value={value.tilt}
          draft={tiltDraft}
          onSlide={commitTilt}
        />
      </div>
    </CellEditorSurface>
  )
})

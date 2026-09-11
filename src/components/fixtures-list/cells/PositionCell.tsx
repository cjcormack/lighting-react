import { memo } from 'react'
import { Slider } from '@/components/ui/slider'
import type { CellResolution } from '../columns'
import type { CellCommit } from '../rowModel'
import type { CellValue } from '../useRowValues'
import { CellEditorSurface } from './CellEditorSurface'
import { UNSET_CELL_TITLE, UnsetCellMark } from './UnsetCellMark'
import { useCellEditorOpen } from './useCellEditorOpen'

interface PositionCellProps {
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
  /**
   * Nothing is selected any more, so this editor's targets are gone with it — close.
   * See `useCellEditorOpen`.
   */
  selectionEmpty?: boolean
  onCommit: (commit: CellCommit) => void
  onBeginEdit: () => void
}

/**
 * Mini crosshair pad + pan/tilt readout; edit via pan/tilt sliders in the shared cell-editor
 * surface, committing continuously. Writes drive the coarse channels only (fine
 * channels fold into the column and are left untouched).
 */
export const PositionCell = memo(function PositionCell({
  value,
  resolutions,
  label = 'Position',
  batchCount,
  placeholder,
  disabled = false,
  autoOpen,
  selectionEmpty,
  onCommit,
  onBeginEdit,
}: PositionCellProps) {
  // Controlled since `PD-POPUP-AFTER-DRAG`: a released marquee has to be able to open this from
  // outside, which an uncontrolled Radix popover offers no door for.
  const { isOpen, setOpen } = useCellEditorOpen({ autoOpen, disabled, selectionEmpty })
  const first = resolutions[0]
  const ranges =
    first.kind === 'position'
      ? { panMin: first.panMin, panMax: first.panMax, tiltMin: first.tiltMin, tiltMax: first.tiltMax }
      : { panMin: 0, panMax: 255, tiltMin: 0, tiltMax: 255 }

  return (
    <CellEditorSurface
      open={isOpen}
      onOpenChange={(open) => {
        setOpen(open)
        if (open) onBeginEdit()
      }}
      title={label}
      contentClassName="w-64 space-y-3"
      trigger={
        <button
          type="button"
          disabled={disabled}
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
      {batchCount > 1 && (
        <p className="text-xs text-muted-foreground">Applying to {batchCount} targets</p>
      )}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Pan</span>
          <span className="tabular-nums">{value.pan}</span>
        </div>
        <Slider
          min={ranges.panMin}
          max={ranges.panMax}
          step={1}
          value={[value.pan]}
          // Per-axis commit: sending the row's aggregate tilt alongside
          // would overwrite every batch target's tilt with one value.
          onValueChange={([pan]) => onCommit({ kind: 'position', pan })}
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Tilt</span>
          <span className="tabular-nums">{value.tilt}</span>
        </div>
        <Slider
          min={ranges.tiltMin}
          max={ranges.tiltMax}
          step={1}
          value={[value.tilt]}
          onValueChange={([tilt]) => onCommit({ kind: 'position', tilt })}
        />
      </div>
    </CellEditorSurface>
  )
})

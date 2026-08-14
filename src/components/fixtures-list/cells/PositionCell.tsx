import { memo } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { PaletteRefNotice } from './PaletteRefNotice'
import type { CellResolution } from '../columns'
import type { CellPaletteRef } from '../useRowOwnership'
import type { CellCommit } from '../rowModel'
import type { CellValue } from '../useRowValues'

interface PositionCellProps {
  value: Extract<CellValue, { kind: 'position' }>
  resolutions: NonNullable<CellResolution>[]
  batchCount: number
  /** Set when this cell's programmer entries reference a named palette. */
  paletteRef?: CellPaletteRef
  onCommit: (commit: CellCommit) => void
  onBeginEdit: () => void
}

/**
 * Mini crosshair pad + pan/tilt readout; edit via popover pan/tilt sliders
 * committing continuously. Writes drive the coarse channels only (fine
 * channels fold into the column and are left untouched).
 */
export const PositionCell = memo(function PositionCell({
  value,
  resolutions,
  batchCount,
  paletteRef,
  onCommit,
  onBeginEdit,
}: PositionCellProps) {
  const first = resolutions[0]
  const ranges =
    first.kind === 'position'
      ? { panMin: first.panMin, panMax: first.panMax, tiltMin: first.tiltMin, tiltMax: first.tiltMax }
      : { panMin: 0, panMax: 255, tiltMin: 0, tiltMax: 255 }

  return (
    <Popover onOpenChange={(open) => open && onBeginEdit()}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-full w-full items-center gap-1.5 rounded px-1.5 text-left hover:bg-accent/50"
        >
          <span className="relative size-4 shrink-0 rounded-sm border border-border bg-muted/50">
            <span
              className="absolute size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
              style={{
                left: `${value.panNormalized * 100}%`,
                top: `${(1 - value.tiltNormalized) * 100}%`,
              }}
            />
          </span>
          <span className="truncate text-xs tabular-nums text-muted-foreground">
            {value.isUniform ? `${value.pan},${value.tilt}` : 'Mixed'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="start">
        <PaletteRefNotice paletteRef={paletteRef} />
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
      </PopoverContent>
    </Popover>
  )
})

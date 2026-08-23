import { Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OWNERSHIP_LABELS, layerCellClass, ownershipCellClass } from './ownership'
import {
  LAYER_LEGEND_GLOSS,
  LAYER_LEGEND_ORDER,
  LEGEND_GLOSS,
  LEGEND_ORDER,
} from './ownershipLegendModel'
import type { LayerLegendKey } from './ownershipLegendModel'
import type { CellState } from './scopedCellValue'
import type { CellOwnership, CellOwnershipSource } from './useRowOwnership'

/**
 * The key beneath the value grid.
 *
 * Each swatch is styled by the **real** `ownershipCellClass`, not a hand-copied colour, so
 * retuning a ring moves the legend with it. Session 2 makes these tints navigational — clicking a
 * tinted cell jumps the grid's scope to whatever won it — which is exactly why they have to be
 * learnable now.
 */
export function OwnershipLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10.5px] text-muted-foreground',
        className,
      )}
    >
      <span className="font-medium">Owned by</span>
      {LEGEND_ORDER.map((source) => (
        <span
          key={source}
          title={OWNERSHIP_LABELS[source]}
          className={cn('flex items-center gap-1.5', source === 'baseline' && 'opacity-62')}
        >
          <span
            aria-hidden="true"
            className={cn(
              'size-3 rounded-sm',
              source === 'baseline'
                ? 'bg-muted'
                : ownershipCellClass(swatchOwnership(source)),
            )}
          />
          {LEGEND_GLOSS[source]}
        </span>
      ))}
      <span className="ml-auto flex items-center gap-1.5">
        <Layers aria-hidden="true" className="size-3" />
        came from a Look layer
      </span>
    </div>
  )
}

/** The minimal ownership a swatch needs: uniform, touched, no group and no layer. */
function swatchOwnership(source: CellOwnershipSource): CellOwnership {
  return { source, touched: true, isUniform: true, owners: [] }
}

/**
 * The key beneath the grid while a Look layer is focused.
 *
 * Same construction as its sibling — swatches styled by the real `layerCellClass` — so the two
 * legends cannot drift from the cells they describe.
 */
export function LayerLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10.5px] text-muted-foreground',
        className,
      )}
    >
      <span className="font-medium">In this look</span>
      {LAYER_LEGEND_ORDER.map((key) => (
        <span key={key} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn('size-3 rounded-sm', layerCellClass(swatchState(key)) || 'bg-muted')}
          />
          {LAYER_LEGEND_GLOSS[key]}
        </span>
      ))}
    </div>
  )
}

function swatchState(key: LayerLegendKey): CellState {
  switch (key) {
    case 'set':
      return { value: SWATCH_VALUE, editable: true }
    case 'unset':
      return { editable: true }
    case 'inert':
      return { editable: false, tone: 'inert' }
    case 'untargeted':
      return { editable: false, tone: 'untargeted' }
  }
}

/** Any value at all — `layerCellClass` only asks whether one is present. */
const SWATCH_VALUE = { kind: 'slider', min: 255, max: 255, isUniform: true } as const

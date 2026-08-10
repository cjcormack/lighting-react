import { useMemo, useState } from 'react'
import { RgbColorPicker, type RgbColor } from 'react-colorful'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { GitCommitHorizontal } from 'lucide-react'
import { COLUMN_DEFS } from './columns'
import { fanColours, fanValues } from './fanMath'
import { clampCommitToResolution, planBatchWrites } from './rowModel'
import { useCellWriters } from './useCellWriters'
import type { ColumnKey } from './columns'
import type { CellCommit, WriteTarget } from './rowModel'

/** Columns fan can drive: continuous sliders plus colour. Settings and
 *  position are excluded — see fanMath.ts for the reasoning. */
const FAN_COLUMNS: ColumnKey[] = ['dimmer', 'colour', 'zoom', 'focus', 'iris', 'strobe', 'speed']

/** A zero-value commit of the right shape, used purely to ask planBatchWrites
 *  which targets a fan on this column would reach. Keeps the shape gating
 *  (settings and colour wheels excluded) in the one place that owns it. */
function probeCommit(col: ColumnKey): CellCommit {
  return col === 'colour' ? { kind: 'colour', r: 0, g: 0, b: 0 } : { kind: 'slider', value: 0 }
}

interface FanPopoverProps {
  /** Expanded selection in visible row order (top→bottom — physical rig
   *  order; the Reverse toggle covers the other direction). A multi-head
   *  fixture target fans across its elements, one point per head. */
  targets: readonly WriteTarget[]
}

export function FanPopover({ targets }: FanPopoverProps) {
  const writers = useCellWriters()
  const [isOpen, setIsOpen] = useState(false)
  const [column, setColumn] = useState<ColumnKey>('dimmer')
  const [fromValue, setFromValue] = useState(0)
  const [toValue, setToValue] = useState(255)
  const [fromColour, setFromColour] = useState<RgbColor>({ r: 255, g: 0, b: 0 })
  const [toColour, setToColour] = useState<RgbColor>({ r: 0, g: 0, b: 255 })
  const [reverse, setReverse] = useState(false)

  // One plan per fannable column, probed via planBatchWrites so element-level
  // properties count — a bare pixel bar (no parent properties) must still
  // offer its Colour column. The plans drive the column list, the enable
  // gates, and Apply itself, so they can never disagree with each other.
  const columnPlans = useMemo(() => {
    const labels = new Map(COLUMN_DEFS.map((d) => [d.key, d.label]))
    return FAN_COLUMNS.map((col) => ({
      col,
      label: labels.get(col) ?? col,
      planned: planBatchWrites(targets, col, probeCommit(col)),
    })).filter((plan) => plan.planned.length > 0)
  }, [targets])

  // The sticky column choice may not exist for this selection (a bare pixel
  // bar has no dimmer); fall back to the first fannable column rather than
  // rendering a blank select over an empty plan.
  const activePlan = columnPlans.find((plan) => plan.col === column) ?? columnPlans[0]
  const plannedCount = activePlan?.planned.length ?? 0
  // A fan needs at least two points on SOME column to be worth opening, and
  // at least two on the CHOSEN column to apply — one point is a set, not a fan.
  const canFan = columnPlans.some((plan) => plan.planned.length >= 2)

  const apply = () => {
    if (!activePlan) return
    // Fan across the planned writes (same path as cell edits), so a target
    // without the property doesn't leave a hole in the gradient.
    // planBatchWrites preserves input order and expands multi-head fixtures
    // into per-element writes inline. Reverse the PLANNED writes, not the
    // input targets — reversing targets would leave each bar's elements in
    // forward order, making Reverse a no-op on a single selected bar.
    const planned = reverse ? [...activePlan.planned].reverse() : activePlan.planned
    if (activePlan.col === 'colour') {
      const colours = fanColours(fromColour, toColour, planned.length)
      planned.forEach(({ target, resolution }, i) => {
        if (resolution.kind !== 'colour') return
        const c = colours[i]
        writers.writeColour(target.key, resolution.property, c.r, c.g, c.b)
      })
      return
    }
    const values = fanValues(fromValue, toValue, planned.length)
    planned.forEach(({ resolution }, i) => {
      if (resolution.kind !== 'slider') return
      // Clamp the ramp value to each target's own channel range.
      const clamped = clampCommitToResolution({ kind: 'slider', value: values[i] }, resolution)
      if (clamped.kind !== 'slider') return
      writers.writeSlider(resolution.property.channel, clamped.value)
    })
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={!canFan}>
          <GitCommitHorizontal className="size-3.5" />
          Fan
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto space-y-3" align="end">
        <p className="text-xs text-muted-foreground">
          Spread first→last across {plannedCount} target{plannedCount === 1 ? '' : 's'}
        </p>
        <div className="flex items-center gap-2">
          <Select value={activePlan?.col ?? column} onValueChange={(v) => setColumn(v as ColumnKey)}>
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {columnPlans.map(({ col, label }) => (
                <SelectItem key={col} value={col}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={reverse}
              onChange={(e) => setReverse(e.target.checked)}
              className="size-3.5 accent-primary"
            />
            Reverse
          </label>
        </div>

        {activePlan?.col === 'colour' ? (
          <div className="flex gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">From</p>
              <RgbColorPicker
                color={fromColour}
                onChange={setFromColour}
                style={{ width: 150, height: 120 }}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">To</p>
              <RgbColorPicker
                color={toColour}
                onChange={setToColour}
                style={{ width: 150, height: 120 }}
              />
            </div>
          </div>
        ) : (
          <div className="w-72 space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>From</span>
                <span className="tabular-nums">{fromValue}</span>
              </div>
              <Slider min={0} max={255} step={1} value={[fromValue]} onValueChange={([v]) => setFromValue(v)} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>To</span>
                <span className="tabular-nums">{toValue}</span>
              </div>
              <Slider min={0} max={255} step={1} value={[toValue]} onValueChange={([v]) => setToValue(v)} />
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" onClick={apply} disabled={plannedCount < 2}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

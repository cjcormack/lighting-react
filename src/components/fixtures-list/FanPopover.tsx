import { useMemo, useState } from 'react'
import { RgbColorPicker, type RgbColor } from 'react-colorful'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { GitCommitHorizontal } from 'lucide-react'
import { COLUMN_DEFS, resolveCell } from './columns'
import { fanColours, fanValues } from './fanMath'
import { clampCommitToResolution, planBatchWrites } from './rowModel'
import { useCellWriters } from './useCellWriters'
import type { ColumnKey } from './columns'
import type { Fixture } from '../../store/fixtures'

/** Columns fan can drive: continuous sliders plus colour. Settings and
 *  position are excluded — see fanMath.ts for the reasoning. */
const FAN_COLUMNS: ColumnKey[] = ['dimmer', 'colour', 'zoom', 'focus', 'iris', 'strobe', 'speed']

interface FanPopoverProps {
  /** Expanded selection in visible row order (top→bottom — physical rig
   *  order; the Reverse toggle covers the other direction). */
  fixtures: readonly Fixture[]
}

export function FanPopover({ fixtures }: FanPopoverProps) {
  const writers = useCellWriters()
  const [isOpen, setIsOpen] = useState(false)
  const [column, setColumn] = useState<ColumnKey>('dimmer')
  const [fromValue, setFromValue] = useState(0)
  const [toValue, setToValue] = useState(255)
  const [fromColour, setFromColour] = useState<RgbColor>({ r: 255, g: 0, b: 0 })
  const [toColour, setToColour] = useState<RgbColor>({ r: 0, g: 0, b: 255 })
  const [reverse, setReverse] = useState(false)

  const availableColumns = useMemo(() => {
    const labels = new Map(COLUMN_DEFS.map((d) => [d.key, d.label]))
    return FAN_COLUMNS.filter((col) =>
      fixtures.some((fixture) => {
        const res = resolveCell(fixture.properties, col)
        return res?.kind === (col === 'colour' ? 'colour' : 'slider')
      }),
    ).map((col) => ({ col, label: labels.get(col) ?? col }))
  }, [fixtures])

  const apply = () => {
    // Fan across the fixtures that can actually take the write (via the same
    // planBatchWrites path as cell edits), so a fixture without the property
    // doesn't leave a hole in the gradient. planBatchWrites preserves input
    // order, which is all the fan needs before zipping with the ramp.
    const ordered = reverse ? [...fixtures].reverse() : fixtures
    if (column === 'colour') {
      const planned = planBatchWrites(ordered, 'colour', { kind: 'colour', r: 0, g: 0, b: 0 })
      const colours = fanColours(fromColour, toColour, planned.length)
      planned.forEach(({ fixture, resolution }, i) => {
        if (resolution.kind !== 'colour') return
        const c = colours[i]
        writers.writeColour(fixture.key, resolution.property, c.r, c.g, c.b)
      })
      return
    }
    const planned = planBatchWrites(ordered, column, { kind: 'slider', value: 0 })
    const values = fanValues(fromValue, toValue, planned.length)
    planned.forEach(({ resolution }, i) => {
      if (resolution.kind !== 'slider') return
      // Clamp the ramp value to each fixture's own channel range.
      const clamped = clampCommitToResolution({ kind: 'slider', value: values[i] }, resolution)
      if (clamped.kind !== 'slider') return
      writers.writeSlider(resolution.property.channel, clamped.value)
    })
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={fixtures.length < 2}>
          <GitCommitHorizontal className="size-3.5" />
          Fan
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto space-y-3" align="end">
        <p className="text-xs text-muted-foreground">
          Spread first→last across {fixtures.length} fixtures
        </p>
        <div className="flex items-center gap-2">
          <Select value={column} onValueChange={(v) => setColumn(v as ColumnKey)}>
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableColumns.map(({ col, label }) => (
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

        {column === 'colour' ? (
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
          <Button size="sm" onClick={apply}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

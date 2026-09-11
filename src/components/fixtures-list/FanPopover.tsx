import { useCallback, useMemo, useState } from 'react'
import { RgbColorPicker, type RgbColor } from 'react-colorful'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useNumberFieldDraft } from '@/hooks/useNumberFieldDraft'
import { GitCommitHorizontal } from 'lucide-react'
import { COLUMN_DEFS } from './columns'
import { fanColours, fanValues } from './fanMath'
import { clampCommitToResolution, planBatchWrites } from './rowModel'
import { CellEditorSurface } from './cells/CellEditorSurface'
import { useCellEditorKeyboard } from './cells/useCellEditorKeyboard'
import { ValueFieldRow } from './cells/ValueFieldRow'
import { applyPlannedWrite, useCellWriters } from './useCellWriters'
import { useFocusedTemplateLayer } from '../programmer/FocusedTemplateLayer'
import { useProgrammerScope } from '../programmer/ProgrammerScope'
import { WORD_CLASS } from './SelectionToolbar'
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

/**
 * One selected column and the heads its cells stand for, in **visible row order** — top→bottom is
 * physical rig order, and the Reverse toggle covers the other direction. A multi-head fixture
 * target fans across its elements, one point per head.
 */
export interface FanColumn {
  col: ColumnKey
  targets: readonly WriteTarget[]
}

/**
 * Every fannable column over one target list — the shape a **row** selection fans by, on the two
 * plain list routes that cannot select a cell. The programmer's Fan reads the marquee instead and
 * never calls this; here the column is still the operator's to choose, as it always was there.
 */
export function fanColumnsForTargets(targets: readonly WriteTarget[]): FanColumn[] {
  return FAN_COLUMNS.map((col) => ({ col, targets }))
}

interface FanPopoverProps {
  /**
   * The marquee, grouped by column. Empty when no cells are selected, which is the one case the
   * button is offered disabled for a reason other than the scope's.
   */
  columns: readonly FanColumn[]
  /** For the trigger button — the programmer's selection bar folds it away at phone widths. */
  className?: string
}

/**
 * Fan: spread first→last across a **cell selection**.
 *
 * It used to take the fixture selection and ask *which column* in its own chooser. The marquee
 * already says that — three Dimmer cells are three heads *and* the dimmer — so the column comes
 * from the selection, and the chooser is drawn only when the selection spans more than one column
 * fan can drive. Everything else it did is unchanged: one plan per fannable column, probed through
 * `planBatchWrites` so element-level properties count and a bare pixel bar still offers its Colour
 * column; the plans drive the column list, the enable gate and Apply itself, so the three cannot
 * disagree.
 *
 * It opens in `CellEditorSurface` — a popover on a desk, a bottom sheet on an upright phone, a side
 * sheet where the viewport is short — because it is a cell editor in every way that matters: a
 * value panel over a selection, whose commit lands on every selected cell. The one difference is
 * that it writes on Apply rather than as it is edited, which is why Enter here *applies* (see the
 * keyboard hook below).
 */
export function FanPopover({ columns, className }: FanPopoverProps) {
  const writers = useCellWriters()
  const [isOpen, setIsOpen] = useState(false)
  const [column, setColumn] = useState<ColumnKey | null>(null)
  const [fromValue, setFromValue] = useState(0)
  const [toValue, setToValue] = useState(255)
  const [fromColour, setFromColour] = useState<RgbColor>({ r: 255, g: 0, b: 0 })
  const [toColour, setToColour] = useState<RgbColor>({ r: 0, g: 0, b: 255 })
  const [reverse, setReverse] = useState(false)

  const columnPlans = useMemo(() => {
    const labels = new Map(COLUMN_DEFS.map((d) => [d.key, d.label]))
    return columns
      .filter(({ col }) => FAN_COLUMNS.includes(col))
      .map(({ col, targets }) => ({
        col,
        label: labels.get(col) ?? col,
        planned: planBatchWrites(targets, col, probeCommit(col)),
      }))
      .filter((plan) => plan.planned.length > 0)
  }, [columns])

  // The chooser's pick may not be in this selection any more (the marquee moved to another column
  // since the panel was last open); fall back to the first fannable column rather than rendering a
  // blank select over an empty plan.
  const activePlan = columnPlans.find((plan) => plan.col === column) ?? columnPlans[0]
  const plannedCount = activePlan?.planned.length ?? 0
  // A fan needs at least two points on SOME column to be worth opening, and
  // at least two on the CHOSEN column to apply — one point is a set, not a fan.
  //
  // **And somewhere for the values to land.** Output is a read of the cook, and a focused
  // *template* layer is a read of a template: neither's cells are editable and `useCellWriters`
  // has no arm for either, so a fan applied there would fall through to a live write and put
  // literals in Local, silently, on a grid drawing itself read-only. Set and Clear beside this
  // button take the same two refusals from `cellKeyboardPermission`; Fan says them itself because
  // it is also drawn on the two plain list routes, which have no scope. A focused *Look* layer is
  // fine — that one has a row draft and the fan lands in it, which is why this is not a blanket
  // "layer scope" test. Disabled with the reason rather than hidden: the gesture is worth
  // discovering, and a control that vanishes when a layer is focused teaches nobody why.
  const scope = useProgrammerScope()
  const focusedTemplate = useFocusedTemplateLayer()
  const readOnlyScope = scope?.kind === 'output' || focusedTemplate != null
  const canFan = !readOnlyScope && columnPlans.some((plan) => plan.planned.length >= 2)
  const title =
    scope?.kind === 'output'
      ? 'Output is a read of the cook — switch to Local to fan values onto these heads'
      : readOnlyScope
    ? 'This layer applies a template — switch to Local to fan values onto these heads'
    : columns.length === 0
      ? 'Select cells to fan a value across'
      : !canFan
        ? 'Fan needs two or more cells in a column it can drive — dimmer, colour, zoom, focus, iris, strobe or speed'
        : 'Fan values first→last across the selected cells'

  const apply = useCallback(() => {
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
      planned.forEach((write, i) => {
        const c = colours[i]
        applyPlannedWrite(writers, {
          ...write,
          commit: { kind: 'colour', r: c.r, g: c.g, b: c.b },
        })
      })
      return
    }
    const values = fanValues(fromValue, toValue, planned.length)
    planned.forEach((write, i) => {
      // Clamp the ramp value to each target's own channel range.
      const commit = clampCommitToResolution({ kind: 'slider', value: values[i] }, write.resolution)
      applyPlannedWrite(writers, { ...write, commit })
    })
  }, [activePlan, fromColour, fromValue, reverse, toColour, toValue, writers])

  /**
   * The fan's ends are typed as well as dragged, and the keyboard behaves as it does in a cell
   * editor: comma steps From → To, Enter applies. Shared with the four of them
   * (`useCellEditorKeyboard`) rather than restated, because this is the same kind of panel — a set
   * of values with a slider and a box each — and two spellings of one gesture is what the
   * typed-value popover was.
   *
   * Enter *applies* rather than merely closing, unlike a cell editor's: a fan is the one value
   * panel on this grid that does not write as it is edited, so there is a press to stand in for.
   *
   * Focus is taken only when the selection has settled the column. With one fannable column the
   * first question is From, and it is focused the way a cell editor's first field is; with several
   * the first question is still *which column*, and jumping to the From box would skip the chooser
   * that decides what From means. The colour fan has no text field, so the hook finds nothing to
   * focus and leaves the pickers alone.
   */
  const { contentRef, onKeyDown, onOpenAutoFocus } = useCellEditorKeyboard({
    autoFocus: columnPlans.length === 1,
    onDone: () => {
      if (plannedCount < 2) return
      apply()
      setIsOpen(false)
    },
  })

  // A fan's ends are plain numbers held here until Apply, but the retype trap is the same one
  // every live field has — `Number('')` is 0, so an emptied box would silently move the end to
  // black before the first digit of its replacement arrived.
  const fromDraft = useNumberFieldDraft(String(fromValue), (n) => setFromValue(clampByte(n)))
  const toDraft = useNumberFieldDraft(String(toValue), (n) => setToValue(clampByte(n)))

  return (
    <CellEditorSurface
      open={isOpen}
      onOpenChange={setIsOpen}
      title="Fan"
      contentClassName="w-auto"
      align="end"
      onOpenAutoFocus={onOpenAutoFocus}
      trigger={
        <Button
          variant="outline"
          size="sm"
          className={className}
          disabled={!canFan}
          title={title}
          aria-label="Fan"
        >
          <GitCommitHorizontal className="size-3.5" />
          {/* The same fold as Set and Clear beside it — one rule for the three verbs. */}
          <span className={WORD_CLASS}>Fan</span>
        </Button>
      }
    >
      <div ref={contentRef} onKeyDown={onKeyDown} className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Spread first→last across {plannedCount} target{plannedCount === 1 ? '' : 's'}
        </p>
        <div className="flex items-center gap-2">
          {/* The chooser only where there is a choice. A one-column marquee has already said
              which column, and a select with one option is a control that cannot be used. */}
          {columnPlans.length > 1 ? (
            <Select
              value={activePlan?.col ?? ''}
              onValueChange={(v) => setColumn(v as ColumnKey)}
            >
              <SelectTrigger size="sm" className="w-32" aria-label="Column to fan">
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
          ) : (
            <span className="text-xs font-medium">{activePlan?.label}</span>
          )}
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
          <div className="w-72 max-w-full space-y-3">
            <ValueFieldRow
              label="From"
              min={0}
              max={255}
              value={fromValue}
              draft={fromDraft}
              onSlide={setFromValue}
            />
            <ValueFieldRow
              label="To"
              min={0}
              max={255}
              value={toValue}
              draft={toDraft}
              onSlide={setToValue}
            />
          </div>
        )}

        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={plannedCount < 2}
            onClick={() => {
              apply()
              setIsOpen(false)
            }}
          >
            Apply
          </Button>
        </div>
      </div>
    </CellEditorSurface>
  )
}

function clampByte(raw: number): number {
  return Math.max(0, Math.min(255, Math.round(raw)))
}

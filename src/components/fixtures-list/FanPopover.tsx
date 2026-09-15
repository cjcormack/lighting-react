import { useMemo } from 'react'
import { COLUMN_DEFS } from './columns'
import { clampCommitToResolution, planBatchWrites } from './rowModel'
import { applyPlannedWrite, useCellWriters } from './useCellWriters'
import { useFocusedTemplateLayer } from '../programmer/FocusedTemplateLayer'
import { useProgrammerScope } from '../programmer/ProgrammerScope'
import { FanPopover as SheetFanPopover, type FanPlan } from '../sheet/FanPopover'
import type { ColumnKey } from './columns'
import type { CellCommit, WriteTarget } from './rowModel'

/** Columns fan can drive: continuous sliders plus colour. Settings and
 *  position are excluded — see `sheet/fanMath.ts` for the reasoning. */
const FAN_COLUMNS: ColumnKey[] = ['dimmer', 'colour', 'zoom', 'focus', 'iris', 'strobe', 'speed']

/** The title's list of them, in the words the button has always used. */
const DRIVABLE_HINT = 'dimmer, colour, zoom, focus, iris, strobe or speed'

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
 * plain list routes. They select cells too now, and a cell selection's Fan reads the marquee like
 * the programmer's; this is the *rows-only* arm those two keep and the programmer does not, where
 * the column is still the operator's to choose in the panel.
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
 * The fixtures list's Fan — the sheet kit's popover with plans built from this list's columns.
 *
 * It used to take the fixture selection and ask *which column* in its own chooser. The marquee
 * already says that — three Dimmer cells are three heads *and* the dimmer — so the column comes
 * from the selection, and the chooser is drawn only when the selection spans more than one column
 * fan can drive. Everything else it did is unchanged: one plan per fannable column, probed through
 * `planBatchWrites` so element-level properties count and a bare pixel bar still offers its Colour
 * column; the plans drive the column list, the enable gate and Apply itself, so the three cannot
 * disagree. The popover itself — the surface, the chooser, From · To, Reverse, the keyboard —
 * moved to `sheet/FanPopover.tsx` when the patch list and the cue sheet gained fans of their own;
 * this file is what is fixture-specific about it.
 *
 * Two refusals are this list's and not the popover's: Output is a read of the cook, and a focused
 * *template* layer is a read of a template. Neither's cells are editable and `useCellWriters`
 * has no arm for either, so a fan applied there would fall through to a live write and put
 * literals in Local, silently, on a grid drawing itself read-only. Set and Clear beside this
 * button take the same two refusals from `cellKeyboardPermission`; Fan says them itself because
 * it is also drawn on the two plain list routes, which have no scope. A focused *Look* layer is
 * fine — that one has a row draft and the fan lands in it, which is why this is not a blanket
 * "layer scope" test. Disabled with the reason rather than hidden: the gesture is worth
 * discovering, and a control that vanishes when a layer is focused teaches nobody why.
 */
export function FanPopover({ columns, className }: FanPopoverProps) {
  const writers = useCellWriters()
  const scope = useProgrammerScope()
  const focusedTemplate = useFocusedTemplateLayer()
  const disabledReason =
    scope?.kind === 'output'
      ? 'Output is a read of the cook — switch to Local to fan values onto these heads'
      : focusedTemplate != null
        ? 'This layer applies a template — switch to Local to fan values onto these heads'
        : null

  const plans = useMemo<FanPlan[]>(() => {
    const labels = new Map(COLUMN_DEFS.map((d) => [d.key, d.label]))
    return columns
      .filter(({ col }) => FAN_COLUMNS.includes(col))
      .map(({ col, targets }) => ({ col, planned: planBatchWrites(targets, col, probeCommit(col)) }))
      .filter((plan) => plan.planned.length > 0)
      .map(({ col, planned }): FanPlan => {
        const label = labels.get(col) ?? col
        // Fan across the planned writes (same path as cell edits), so a target without the
        // property doesn't leave a hole in the gradient. planBatchWrites preserves input order
        // and expands multi-head fixtures into per-element writes inline. Reverse the PLANNED
        // writes, not the input targets — reversing targets would leave each bar's elements in
        // forward order, making Reverse a no-op on a single selected bar.
        if (col === 'colour') {
          return {
            kind: 'colour',
            col,
            label,
            count: planned.length,
            apply: (colours, reverse) => {
              const order = reverse ? [...planned].reverse() : planned
              order.forEach((write, i) => {
                const c = colours[i]
                applyPlannedWrite(writers, { ...write, commit: { kind: 'colour', r: c.r, g: c.g, b: c.b } })
              })
            },
          }
        }
        return {
          kind: 'value',
          col,
          label,
          count: planned.length,
          apply: (values, reverse) => {
            const order = reverse ? [...planned].reverse() : planned
            order.forEach((write, i) => {
              // Clamp the ramp value to each target's own channel range.
              const commit = clampCommitToResolution({ kind: 'slider', value: values[i] }, write.resolution)
              applyPlannedWrite(writers, { ...write, commit })
            })
          },
        }
      })
  }, [columns, writers])

  return (
    <SheetFanPopover
      plans={plans}
      disabledReason={disabledReason}
      drivableHint={DRIVABLE_HINT}
      // The plans above are already filtered to columns Fan can drive, so a Setting or Position
      // marquee hands in none — and must still read as "cells in a column it cannot drive", not
      // as no selection.
      noSelection={columns.length === 0}
      className={className}
    />
  )
}

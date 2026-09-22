import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { RgbColorPicker, type RgbColor } from 'react-colorful'
import { GitCommitHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EditorSurface } from '../editor/EditorSurface'
import { useEditorKeyboard } from '../editor/useEditorKeyboard'
import { ValueFieldRow } from '../editor/ValueFieldRow'
import { fanAddresses, fanColours, fanDurations, fanValues, type FanColour } from './fanMath'
import { WORD_CLASS } from './toolbarFolds'

/**
 * One column the selection can fan, in the shape the popover draws controls for.
 *
 * A closed vocabulary of four kinds rather than a render prop, because the *state* a fan holds
 * until Apply (its ends, its step, its reverse flag) is the popover's to keep, and a kind is what
 * says which controls edit it. Each surface builds its plans from its own columns and selection —
 * the programmer through `planBatchWrites`, the patch list from its rows' footprints, the cue sheet
 * from its fade column — and hands them in; the popover owns the gesture and nothing else.
 *
 * `count` is how many points the fan has, and a plan with fewer than two is offered but cannot
 * apply: one point is a set, not a fan.
 */
export type FanPlan =
  | {
      /** From · To over a byte range, endpoints exact — the programmer's sliders. */
      kind: 'value'
      col: string
      label: string
      count: number
      /** Applied in plan order; `reverse` asks for the ends the other way round. */
      apply: (values: number[], reverse: boolean) => void
    }
  | {
      /** Two pickers, RGB interpolated per channel — the programmer's Colour column. */
      kind: 'colour'
      col: string
      label: string
      count: number
      apply: (colours: FanColour[], reverse: boolean) => void
    }
  | {
      /**
       * From · Step in visible-row order — the patch list's Address column. `footprints` is one
       * channel count per head, in that order; a blank step lands each head after the previous by
       * its own footprint (`fanAddresses`).
       */
      kind: 'address'
      col: string
      label: string
      count: number
      /** Names the universe the walk is on; the PUT cannot move a head to another. */
      universe: number
      footprints: readonly number[]
      /** What the preview says about a landing — the heads that would collide, or nothing. */
      check?: (channels: number[]) => string | null
      apply: (channels: number[]) => void
    }
  | {
      /** From · To in milliseconds with a Spread — the cue sheet's Fade column. */
      kind: 'duration'
      col: string
      label: string
      count: number
      /** Names each point for the preview line, in plan order: `Q6`, `Q7`, … */
      names?: readonly string[]
      apply: (ms: number[]) => void
    }

interface FanPopoverProps {
  /** One per fannable column of the selection. Empty when nothing selected fans. */
  plans: readonly FanPlan[]
  /**
   * The surface refuses the gesture as a whole — a read-only scope, a locked show, an offline desk
   * — and this is the reason the disabled button carries. Wins over every other title.
   */
  disabledReason?: string | null
  /**
   * The columns this surface *can* fan, for the title when the selection has none of them with two
   * points: "…in a column it can drive — dimmer, colour, …".
   */
  drivableHint: string
  /**
   * Nothing is selected at all. A surface that filters its plans down to fannable columns before
   * handing them in must say so itself, or a marquee over columns Fan cannot drive would read as
   * no selection; absent, an empty `plans` is taken to mean it.
   */
  noSelection?: boolean
  /**
   * The surface can offer a way past [disabledReason]. Given, the trigger stays live and a press
   * calls this instead of opening — the cue sheet's "unlock the show?" — rather than sitting there
   * greyed out beside Set and Clear, which do the same (`CellSelectionActions`).
   */
  onRefused?: () => void
  /** For the trigger button — the programmer's selection bar folds it away at phone widths. */
  className?: string
}

/**
 * Fan: spread first→last across a **cell selection**.
 *
 * Written once for every sheet (CLAUDE.md §Sheet kit). It used to be the programmer's alone, and
 * the programmer's arm is unchanged: the column comes from the selection, the chooser is drawn
 * only when the marquee spans more than one fannable column, From · To are byte fields with a
 * slider each and a Reverse toggle, and Enter applies. What the kit added is two more kinds —
 * a **step** for addresses and a **spread** for fade times — as plan kinds beside it, so the three
 * surfaces share the trigger, the surface, the chooser and the keyboard rather than each drawing
 * a popover of its own.
 *
 * It opens in `EditorSurface` — a popover on a desk, a bottom sheet on an upright phone, a side
 * sheet where the viewport is short — because it is a cell editor in every way that matters: a
 * value panel over a selection, whose commit lands on every selected cell. The one difference is
 * that it writes on Apply rather than as it is edited, which is why Enter here *applies* (see the
 * keyboard hook below).
 */
export function FanPopover({
  plans,
  disabledReason,
  drivableHint,
  noSelection,
  onRefused,
  className,
}: FanPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [column, setColumn] = useState<string | null>(null)
  const [fromValue, setFromValue] = useState(0)
  const [toValue, setToValue] = useState(255)
  const [fromColour, setFromColour] = useState<RgbColor>({ r: 255, g: 0, b: 0 })
  const [toColour, setToColour] = useState<RgbColor>({ r: 0, g: 0, b: 255 })
  const [reverse, setReverse] = useState(false)
  const [fromAddress, setFromAddress] = useState('1')
  const [step, setStep] = useState('')
  const [fromDuration, setFromDuration] = useState('1s')
  const [toDuration, setToDuration] = useState('4s')

  const fannable = useMemo(() => plans.filter((plan) => plan.count > 0), [plans])
  // The chooser's pick may not be in this selection any more (the marquee moved to another column
  // since the panel was last open); fall back to the first fannable column rather than rendering a
  // blank select over an empty plan.
  const activePlan = fannable.find((plan) => plan.col === column) ?? fannable[0]
  const plannedCount = activePlan?.count ?? 0
  // A fan needs at least two points on SOME column to be worth opening, and at least two on the
  // CHOSEN column to apply — one point is a set, not a fan.
  const canFan = !disabledReason && fannable.some((plan) => plan.count >= 2)
  // A surface's own refusal is the one the operator can answer; "no two cells to fan" is not, so
  // the offer is made only where [disabledReason] is what closed the button.
  const refusable = disabledReason != null && onRefused != null
  const title =
    disabledReason ??
    ((noSelection ?? plans.length === 0)
      ? 'Select cells to fan a value across'
      : !canFan
        ? `Fan needs two or more cells in a column it can drive — ${drivableHint}`
        : 'Fan values first→last across the selected cells')

  // The address arm's landing, computed as it is typed so the preview can name a collision before
  // Apply — the rule every desk surveyed makes visible, and the one the server cannot be relied on
  // for (the patch PUT has no overlap check; see CLAUDE.md §Sheet kit).
  const addressWalk = useMemo(() => {
    if (activePlan?.kind !== 'address') return null
    const from = Number(fromAddress)
    const stepValue = step.trim() === '' ? null : Number(step)
    if (!Number.isInteger(from) || from < 1) return { error: 'From is a channel, 1–512', channels: null }
    if (stepValue !== null && (!Number.isInteger(stepValue) || stepValue < 1)) {
      return { error: 'Step is a whole number of channels, or blank for each fixture’s footprint', channels: null }
    }
    const channels = fanAddresses(from, stepValue, activePlan.footprints)
    const last = channels[channels.length - 1] ?? from
    const lastFootprint = activePlan.footprints[activePlan.footprints.length - 1] ?? 1
    if (last + Math.max(1, lastFootprint) - 1 > 512) {
      return { error: `Runs past channel 512 on universe ${activePlan.universe}`, channels: null }
    }
    return { error: activePlan.check?.(channels) ?? null, channels }
  }, [activePlan, fromAddress, step])

  const durationWalk = useMemo(() => {
    if (activePlan?.kind !== 'duration') return null
    const from = parseDurationMs(fromDuration)
    const to = parseDurationMs(toDuration)
    if (from === undefined || to === undefined) {
      return { error: 'A fade is seconds, or a number with ms, s or m', ms: null }
    }
    return { error: null, ms: fanDurations(from, to, activePlan.count) }
  }, [activePlan, fromDuration, toDuration])

  const canApply =
    plannedCount >= 2 &&
    (activePlan?.kind === 'address'
      ? addressWalk?.channels != null && addressWalk.error == null
      : activePlan?.kind === 'duration'
        ? durationWalk?.ms != null
        : true)

  const apply = useCallback(() => {
    if (!activePlan) return
    switch (activePlan.kind) {
      case 'value':
        activePlan.apply(fanValues(fromValue, toValue, activePlan.count), reverse)
        return
      case 'colour':
        activePlan.apply(fanColours(fromColour, toColour, activePlan.count), reverse)
        return
      case 'address':
        if (addressWalk?.channels && addressWalk.error == null) activePlan.apply(addressWalk.channels)
        return
      case 'duration':
        if (durationWalk?.ms) activePlan.apply(durationWalk.ms)
        return
    }
  }, [activePlan, addressWalk, durationWalk, fromColour, fromValue, reverse, toColour, toValue])

  /**
   * The fan's ends are typed as well as dragged, and the keyboard behaves as it does in a cell
   * editor: comma steps From → To, Enter applies. Shared with the cell editors
   * (`useEditorKeyboard`) rather than restated, because this is the same kind of panel — a set
   * of values with a field each — and two spellings of one gesture is what the typed-value popover
   * was.
   *
   * Enter *applies* rather than merely closing, unlike a cell editor's: a fan is the one value
   * panel on a sheet that does not write as it is edited, so there is a press to stand in for.
   *
   * Focus is taken only when the selection has settled the column. With one fannable column the
   * first question is From, and it is focused the way a cell editor's first field is; with several
   * the first question is still *which column*, and jumping to the From box would skip the chooser
   * that decides what From means. The colour fan has no text field, so the hook finds nothing to
   * focus and leaves the pickers alone.
   */
  const { contentRef, onKeyDown, onOpenAutoFocus } = useEditorKeyboard({
    autoFocus: fannable.length === 1,
    onDone: () => {
      if (!canApply) return
      apply()
      setIsOpen(false)
    },
  })

  return (
    <EditorSurface
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
          disabled={!canFan && !refusable}
          onClick={refusable ? (e) => { e.preventDefault(); onRefused?.() } : undefined}
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
          {activePlan?.kind === 'address'
            ? `Re-space ${plannedCount} fixture${plannedCount === 1 ? '' : 's'} in visible order`
            : `Spread first→last across ${plannedCount} target${plannedCount === 1 ? '' : 's'}`}
        </p>
        <div className="flex items-center gap-2">
          {/* The chooser only where there is a choice. A one-column marquee has already said
              which column, and a select with one option is a control that cannot be used. */}
          {fannable.length > 1 ? (
            <Select value={activePlan?.col ?? ''} onValueChange={(v) => setColumn(v)}>
              <SelectTrigger size="sm" className="w-32" aria-label="Column to fan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fannable.map(({ col, label }) => (
                  <SelectItem key={col} value={col}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs font-medium">{activePlan?.label}</span>
          )}
          {(activePlan?.kind === 'value' || activePlan?.kind === 'colour') && (
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={reverse}
                onChange={(e) => setReverse(e.target.checked)}
                className="size-3.5 accent-primary"
              />
              Reverse
            </label>
          )}
        </div>

        {activePlan?.kind === 'colour' ? (
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
              <RgbColorPicker color={toColour} onChange={setToColour} style={{ width: 150, height: 120 }} />
            </div>
          </div>
        ) : activePlan?.kind === 'address' ? (
          <div className="w-72 max-w-full space-y-3">
            <div className="flex items-end gap-2">
              <FanField label="From" hint={`u${activePlan.universe}`}>
                <Input
                  type="number"
                  min={1}
                  max={512}
                  step={1}
                  aria-label="From"
                  className="h-8 w-24 tabular-nums"
                  value={fromAddress}
                  onChange={(e) => setFromAddress(e.target.value)}
                />
              </FanField>
              <FanField label="Step">
                <Input
                  type="number"
                  min={1}
                  max={512}
                  step={1}
                  aria-label="Step"
                  placeholder="footprint"
                  className="h-8 w-24 tabular-nums"
                  value={step}
                  onChange={(e) => setStep(e.target.value)}
                />
              </FanField>
            </div>
            <p className={`text-xs ${addressWalk?.error ? 'text-destructive' : 'text-muted-foreground'}`}>
              {addressWalk?.error ??
                `Step is a fixed gap; blank uses each fixture’s footprint. ${describeChannels(activePlan.universe, addressWalk?.channels ?? [])}`}
            </p>
          </div>
        ) : activePlan?.kind === 'duration' ? (
          <div className="w-72 max-w-full space-y-3">
            <div className="flex items-end gap-2">
              <FanField label="From">
                <Input
                  type="text"
                  aria-label="From"
                  className="h-8 w-20 tabular-nums"
                  value={fromDuration}
                  onChange={(e) => setFromDuration(e.target.value)}
                />
              </FanField>
              <FanField label="To">
                <Input
                  type="text"
                  aria-label="To"
                  className="h-8 w-20 tabular-nums"
                  value={toDuration}
                  onChange={(e) => setToDuration(e.target.value)}
                />
              </FanField>
              <FanField label="Spread">
                {/* One spread today. A select rather than a caption so the second one is a row
                    added here rather than a control invented later; `fanDurations` is where it
                    would go. */}
                <Select value="linear" onValueChange={() => {}}>
                  <SelectTrigger size="sm" className="w-24" aria-label="Spread">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="linear">Linear</SelectItem>
                  </SelectContent>
                </Select>
              </FanField>
            </div>
            <p className={`text-xs tabular-nums ${durationWalk?.error ? 'text-destructive' : 'text-muted-foreground'}`}>
              {durationWalk?.error ??
                (durationWalk?.ms ?? [])
                  .map((ms, i) => `${activePlan.names?.[i] ?? i + 1} ${formatDurationMs(ms)}`)
                  .join(' · ')}
            </p>
          </div>
        ) : (
          <div className="w-72 max-w-full space-y-3">
            {/* A fan's ends are plain numbers held here until Apply; the field owns the retype trap
                (`EditorField`) and the clamp is this panel's, a byte being a byte. */}
            <ValueFieldRow label="From" min={0} max={255} value={fromValue} onChange={(n) => setFromValue(clampByte(n))} />
            <ValueFieldRow label="To" min={0} max={255} value={toValue} onChange={(n) => setToValue(clampByte(n))} />
          </div>
        )}

        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!canApply}
            onClick={() => {
              apply()
              setIsOpen(false)
            }}
          >
            Apply
          </Button>
        </div>
      </div>
    </EditorSurface>
  )
}

function FanField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {hint && <span className="font-mono text-[10px] opacity-70">{hint}</span>}
      </p>
      {children}
    </div>
  )
}

function clampByte(raw: number): number {
  return Math.max(0, Math.min(255, Math.round(raw)))
}

/** `1-001, 1-021 … 1-141` — the first three and the last, or all of them when there are few. */
function describeChannels(universe: number, channels: readonly number[]): string {
  if (channels.length === 0) return ''
  const fmt = (c: number) => `${universe}-${String(c).padStart(3, '0')}`
  if (channels.length <= 4) return channels.map(fmt).join(', ')
  return `${channels.slice(0, 3).map(fmt).join(', ')} … ${fmt(channels[channels.length - 1])}`
}

/**
 * A fade time typed by an operator, in milliseconds — the cue sheet's own grammar
 * (`lib/cueUtils.parseFadeDuration`), restated here without the snap arm because a fan's end is a
 * duration and not "no fade". Undefined for text that is not one.
 */
export function parseDurationMs(raw: string): number | undefined {
  const text = raw.trim()
  const match = /^(\d*\.?\d+)\s*(ms|msec|s|sec|secs|m|min)?$/i.exec(text)
  if (!match) return undefined
  const value = Number(match[1])
  if (!Number.isFinite(value) || value < 0) return undefined
  const unit = (match[2] ?? 's').toLowerCase()
  const ms =
    unit === 'ms' || unit === 'msec' ? value : unit === 'm' || unit === 'min' ? value * 60_000 : value * 1000
  return Math.round(ms)
}

function formatDurationMs(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

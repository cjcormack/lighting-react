import { useState, useCallback, useRef, useEffect } from 'react'
import { RgbColorPicker, type RgbColor } from 'react-colorful'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { CellEditorSurface } from '@/components/fixtures-list/cells/CellEditorSurface'
import { numericSeed, useCellEditorKeyboard } from '@/components/fixtures-list/cells/useCellEditorKeyboard'
import { cn } from '@/lib/utils'
import { ChannelNumberInput } from './ChannelNumberInput'
import { ExtendedChannelSlider } from './ExtendedChannelSlider'

interface ColourPickerPopoverProps {
  /** Current RGB channel values */
  r: number
  g: number
  b: number
  /** Current extended channel values (undefined when fixture lacks the channel) */
  w?: number
  a?: number
  uv?: number
  /** Combined preview CSS colour (includes W/A/UV effect) */
  combinedCss: string
  /** Whether the fixture has extended channels */
  hasWhiteChannel: boolean
  hasAmberChannel: boolean
  hasUvChannel: boolean
  /** Callback when colour is picked */
  onColourChange: (r: number, g: number, b: number, w?: number, a?: number, uv?: number) => void
  /**
   * Rendered above the picker. The programmer sheet uses it to warn that editing a cell which
   * references a palette replaces that reference with a fixed value — a slot rather than a
   * boolean prop, so callers that have nothing to say pay nothing and this component stays
   * ignorant of palettes.
   */
  notice?: React.ReactNode
  /**
   * Drive the popover from outside instead of letting it keep its own open state. Pass both or
   * neither — `ColourCell` does, so a released single-column marquee can open the picker with no
   * click (`PD-POPUP-AFTER-DRAG`); the two property visualizers have no such door to offer and
   * leave it uncontrolled.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * Draw the typed R/G/B and per-emitter fields (`PD-COLOUR-EDITOR-INPUTS`). **Opt-in, and off by
   * default**, because the finding is about the *cell* editor and this popover has three callers.
   * The other two — `PropertyVisualizers` and `GroupPropertyVisualizers` — already render a full
   * always-visible `ColourChannelSlider` bank for R/G/B and every emitter beside the same swatch,
   * so fields in here would be a second live editor for the same six values, opened over the first.
   * `ColourCell` has no such bank: the popover is the only editor a grid cell has, which is the
   * whole reason the numbers had nowhere to be typed.
   */
  channelFields?: boolean
  /**
   * Open in the shared cell-editor surface, which folds to a bottom sheet at phone widths
   * (`CellEditorSurface`) — instead of always being a floating popover.
   *
   * **Opt-in, and off by default**, on the same reasoning as [channelFields] and for the same two
   * other callers. The fold exists because a grid cell's popover has nowhere good to sit on a
   * 390px screen; `PropertyVisualizers` and `GroupPropertyVisualizers` open this from a page they
   * already own the width of, beside their own always-visible channel bank, and a modal sheet over
   * that bank would cover the very thing it is editing.
   */
  sheetWhenNarrow?: boolean
  /** Titles the editor where it is a bottom sheet — required by [sheetWhenNarrow], unused without. */
  title?: string
  /**
   * Spend less height: a shorter picker, tighter emitter rows, and no explanatory line.
   *
   * For any viewport too short to hold the full editor — a landscape phone's sheet leaves ~330px
   * and a 524px-tall window's popover gets about half of that, against a full editor of ~430.
   * Scrolling is the wrong answer for this one: every control here is live, so a hidden emitter
   * slider is a channel the operator cannot see themselves driving; and a popover does not even
   * scroll, it clips. The picker is the part that gives height up most cheaply, because the typed
   * R/G/B boxes beside it say the same thing exactly.
   *
   * Set by `ColourCell` from `useCellEditorCramped()`, which is a height question rather than a
   * form one — see that hook.
   */
  compact?: boolean
  /**
   * This editor was opened by a character typed at the grid, which lands in the **R** box as its
   * first keystroke. Null or absent for a click or a released marquee, which carry no character.
   *
   * It says nothing about *focus* — R is focused however the editor was opened; see
   * `useCellEditorKeyboard`. `ColourCell`'s alone, like [channelFields].
   */
  keyboardOpen?: string | null
  /** The trigger element (swatch) */
  children: React.ReactNode
}

/** The whole of what this editor writes: three colour bytes and the three bundled emitters. */
interface Channels {
  r: number
  g: number
  b: number
  w: number
  a: number
  uv: number
}

function isExactWhite(color: RgbColor): boolean {
  return color.r === 255 && color.g === 255 && color.b === 255
}

/** Parse an rgb() or other CSS colour string to RGB values */
function parseCssColour(css: string): RgbColor {
  // Handle rgb(r, g, b) format
  const rgbMatch = css.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
    }
  }
  // Fallback to black
  return { r: 0, g: 0, b: 0 }
}

export function ColourPickerPopover({
  r,
  g,
  b,
  w,
  a,
  uv,
  combinedCss,
  hasWhiteChannel,
  hasAmberChannel,
  hasUvChannel,
  onColourChange,
  notice,
  open: controlledOpen,
  onOpenChange,
  channelFields = false,
  sheetWhenNarrow = false,
  title = 'Colour',
  compact = false,
  keyboardOpen = null,
  children,
}: ColourPickerPopoverProps) {
  // Radix owns the open state for an uncontrolled caller — `open` below is `undefined` for them,
  // which is exactly how `Popover` asks for its own internal state. What is mirrored here is only
  // what *this* component still has to know: the reset effect wants "is it open", and Radix
  // exposes that nowhere but the callback. So the mirror is written only when there is no
  // controlling caller to ask instead, and never beside one — a write there would be state nothing
  // can ever read, since `controlledOpen` wins the `??`.
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const isOpen = controlledOpen ?? uncontrolledOpen
  const setIsOpen = useCallback(
    (next: boolean) => {
      if (onOpenChange) onOpenChange(next)
      else setUncontrolledOpen(next)
    },
    [onOpenChange],
  )
  // Track the picker's internal colour state (initialized from combined preview)
  const [pickerColor, setPickerColor] = useState<RgbColor>(() => parseCssColour(combinedCss))
  // Track if user has made a change since opening
  const hasChangedRef = useRef(false)

  /**
   * The six channels this editor has most recently *asked* for, or null once the desk has answered.
   *
   * A commit here sets the **whole** colour — `onColourChange` takes all six — so every handler has
   * to fill the channels it is not changing from somewhere. Reading them straight off the props is
   * what made two quick edits lose one: the props are the desk's echo, which lags the write by a
   * commit throttle (~33 ms), so typing R and then G inside that window sent G beside R's *old*
   * value and silently reverted it. Buffering what we sent closes it, and the effect below is what
   * stops the buffer going stale: any movement in the props — our echo, a clamp, another client, an
   * effect driving the head — means the desk has spoken more recently than we have, so the buffer
   * is spent. The popover's own open effect drops it too, which bounds a write the desk refused
   * outright (props never move, so the effect never fires) to a single editing session.
   */
  const pendingRef = useRef<Channels | null>(null)
  useEffect(() => {
    pendingRef.current = null
  }, [r, g, b, w, a, uv])

  // Reset picker colour to combined preview when popover opens
  useEffect(() => {
    if (isOpen) {
      setPickerColor(parseCssColour(combinedCss))
      hasChangedRef.current = false
      pendingRef.current = null
    }
  }, [isOpen, combinedCss])

  /**
   * What the editor believes the six channels are: our own outstanding write if there is one, the
   * props otherwise.
   *
   * **A function, called at commit time, never a value computed during render.** Two edits can
   * land in one task with no re-render between them — two `input` events dispatched together, or
   * a keystroke arriving while React is still batching — and a handler closing over a render-time
   * copy would read the props for the second one and revert the first, which is the whole defect
   * the buffer exists to close. Found in a browser after a version that read the render-time copy
   * passed its own unit test, because `fireEvent` flushes a render between the two changes and the
   * browser does not.
   */
  const currentChannels = (): Channels =>
    pendingRef.current ?? { r, g, b, w: w ?? 0, a: a ?? 0, uv: uv ?? 0 }
  // The render-time reading, for what the fields and sliders display.
  const channels = currentChannels()

  /**
   * The one write. Every handler builds a whole six-channel value and hands it here, so the
   * "an emitter the head hasn't got is `undefined`, not 0" mapping is stated once instead of once
   * per handler — it is the same three lines that used to sit in four places.
   */
  const send = useCallback(
    (next: Channels) => {
      pendingRef.current = next
      onColourChange(
        next.r,
        next.g,
        next.b,
        hasWhiteChannel ? next.w : undefined,
        hasAmberChannel ? next.a : undefined,
        hasUvChannel ? next.uv : undefined,
      )
    },
    [onColourChange, hasWhiteChannel, hasAmberChannel, hasUvChannel],
  )

  /**
   * The picker is a *gesture* — "make it this colour" — so it replaces the whole output: the
   * emitters go to 0, and pure white becomes the white LED on a head that has one.
   */
  const handleColourChange = useCallback(
    (color: RgbColor) => {
      setPickerColor(color)
      hasChangedRef.current = true
      send(
        isExactWhite(color) && hasWhiteChannel
          ? { r: 0, g: 0, b: 0, w: 255, a: 0, uv: 0 }
          : { r: color.r, g: color.g, b: color.b, w: 0, a: 0, uv: 0 },
      )
    },
    [send, hasWhiteChannel],
  )

  /**
   * A typed or dragged byte is a *statement about one channel*, and leaves the other five where
   * they are — which is the only way "R 200 over the amber I already set" can be said at all, and
   * why the emitters have controls of their own rather than being folded into the picker's
   * substitution. So typing 255 into all three does **not** flip to the white LED: that would show
   * the operator 0 in the box they had just typed 255 into.
   */
  // Not a `useCallback`, deliberately: it reads the props through `currentChannels`, so it would
  // rebuild on every prop change anyway — and no consumer is memoised, so a stable identity buys
  // nothing. Its callers are inline arrows.
  const setChannel = (channel: keyof Channels, value: number) => {
    // **The knob is deliberately not moved to follow the number.** `RgbColorPicker` keeps its state
    // as HSV and converts back on the way out, and that round trip is lossy for most colours — so
    // pushing a typed RGB in as its `color` makes it fire `onChange` straight back with a value a
    // point or two off (200,20,30 comes back 199,…). That echo is indistinguishable from a drag, so
    // it lands in `handleColourChange`, which is the whole-output gesture: it would zero every
    // emitter the operator had set, on some colours and not others. The knob staying put until the
    // popover is reopened is the cheaper wrong thing; the cell's own swatch tracks the value.
    send({ ...currentChannels(), [channel]: value })
  }

  // Enter closes, comma steps R → G → B → the emitters and round again, and a keyboard-opened
  // editor focuses R. Shared with the four cell editors, which is the point: this popover *is* the
  // colour cell's editor. The two property visualizers pass no `keyboardOpen`, so nothing here
  // takes focus for them; their popovers hold no text field to type Enter or a comma into either.
  const { contentRef, onKeyDown, onOpenAutoFocus } = useCellEditorKeyboard({
    // The two property visualizers draw no text fields here (see [channelFields]), so there is
    // nothing for focus to land on and taking it would only move it off the swatch they opened.
    autoFocus: channelFields,
    onDone: useCallback(() => setIsOpen(false), [setIsOpen]),
  })

  const hasExtendedChannels = hasWhiteChannel || hasAmberChannel || hasUvChannel
  // Which emitters this head has, and what each is at — one lookup, so the row list, the value and
  // the write can't disagree by a transposed ternary. Presence comes from the caller's **colour
  // descriptor** (`whiteChannel` / `amberChannel` / `uvChannel`): the bundled emitters are left out
  // of the flat descriptor list, so there is no category to scan for them.
  const emitters: Record<EmitterKey, { has: boolean; value: number }> = {
    w: { has: hasWhiteChannel, value: channels.w },
    a: { has: hasAmberChannel, value: channels.a },
    uv: { has: hasUvChannel, value: channels.uv },
  }

  const body = (
    // Compact turns the column into a **wrapping row**, so the emitter sliders sit beside the
    // picker instead of under it. That is the change that makes it fit: stacked, the editor is
    // ~260px in the ~285px a landscape iPhone has left after Safari, and every trim that got it
    // under was taking something away. Side by side it is the height of the picker alone. The
    // wrap is what makes it one layout rather than two — a narrow sheet stacks it again, which is
    // the portrait arrangement unchanged.
    <div
      ref={contentRef}
      onKeyDown={onKeyDown}
      className={compact ? 'flex flex-wrap items-start gap-4' : 'space-y-3'}
    >
      {notice}
      {/* The picker leads and the numbers sit beside it: nobody thinks in bytes when they are
          choosing a colour, and nobody wants a picker when they already know the number. The
          numbers are opt-in — see `channelFields`. */}
      {/* `react-colorful` sizes itself in CSS, and `index.css` already pins it — with `!important` —
          so the compact size is a class defined beside those rules rather than a Tailwind arbitrary
          variant, which would lose to them. It goes on the row that is here anyway rather than on a
          wrapper of its own: this `body` is shared by all three callers, so a wrapper would have
          added a bare `<div>` to the two property visualizers as a side effect of a change that is
          none of their business. The row is an ancestor of `.react-colorful` either way.

          The title sits here for the same reason, and reads better for it — it is about the picker
          *and* the boxes beside it, which is precisely this row. */}
      <div
        className={cn('flex items-start gap-3', compact && 'colour-picker-compact')}
        title={
          channelFields && hasWhiteChannel
            ? 'Pure white in the picker drives the white LED; the boxes set one channel each.'
            : undefined
        }
      >
        <RgbColorPicker color={pickerColor} onChange={handleColourChange} />
        {channelFields && (
          <div className={cn('w-20 shrink-0', compact ? 'space-y-2.5' : 'space-y-1.5')}>
            <ChannelNumberInput
              label="R"
              value={channels.r}
              onChange={(v) => setChannel('r', v)}
              seed={numericSeed(keyboardOpen)}
            />
            <ChannelNumberInput label="G" value={channels.g} onChange={(v) => setChannel('g', v)} />
            <ChannelNumberInput label="B" value={channels.b} onChange={(v) => setChannel('b', v)} />
          </div>
        )}
      </div>
      {channelFields ? (
        // Dropped when [compact], which is the one piece of guidance here rather than a control:
        // it is also on the picker's own title, so it is moved rather than lost.
        hasWhiteChannel &&
        !compact && (
          <p className="text-[11px] text-muted-foreground/60">
            Pure white in the picker drives the white LED; the boxes set one channel each.
          </p>
        )
      ) : (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-mono">
            R:{r} G:{g} B:{b}
          </span>
          {hasWhiteChannel && (
            <span className="text-muted-foreground/60">White = use white LED</span>
          )}
        </div>
      )}
      {hasExtendedChannels && (
        <div
          className={cn(
            compact
              // `min-w` is the wrap threshold: below it the emitters drop under the picker rather
              // than being squeezed to a slider nothing could drag. No rule, either — a border
              // above a column that is *beside* its neighbour separates nothing.
              ? 'min-w-[13rem] flex-1 space-y-3'
              : 'space-y-2 border-t border-border pt-2',
          )}
        >
          {EMITTERS.filter(({ key }) => emitters[key].has).map(({ key, label, tint }) =>
            channelFields ? (
              <EmitterRow
                key={key}
                label={label}
                tint={tint}
                value={emitters[key].value}
                onChange={(v) => setChannel(key, v)}
              />
            ) : (
              // The readout row the two property visualizers have always had. They own their
              // own full channel bank outside this popover, so a field here would be a second
              // live editor for the same byte — see `channelFields`.
              <ExtendedChannelSlider
                key={key}
                label={label}
                value={emitters[key].value}
                onChange={(v) => setChannel(key, v)}
                color={tint}
              />
            ),
          )}
        </div>
      )}
    </div>
  )

  if (sheetWhenNarrow) {
    return (
      <CellEditorSurface
        open={controlledOpen}
        onOpenChange={setIsOpen}
        title={title}
        contentClassName="w-auto"
        onOpenAutoFocus={onOpenAutoFocus}
        trigger={children}
        // Alone among the cell editors: see [compact], and `wide` on the surface.
        wide
      >
        {body}
      </CellEditorSurface>
    )
  }

  return (
    <Popover open={controlledOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-auto" align="start" onOpenAutoFocus={onOpenAutoFocus}>
        {body}
      </PopoverContent>
    </Popover>
  )
}

type EmitterKey = 'w' | 'a' | 'uv'

const EMITTERS = [
  { key: 'w', label: 'W', tint: '#fffbe6' },
  { key: 'a', label: 'A', tint: '#ffbf00' },
  { key: 'uv', label: 'UV', tint: '#7f00ff' },
] as const satisfies readonly { key: EmitterKey; label: string; tint: string }[]

/** One emitter: tinted dot, slider, and the byte as a field rather than a readout. */
function EmitterRow({
  label,
  tint,
  value,
  onChange,
}: {
  label: string
  tint: string
  value: number
  onChange: (next: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-9 shrink-0 items-center gap-1 text-[11px]">
        <span
          className="inline-block size-2 shrink-0 rounded-full border border-border"
          style={{ backgroundColor: tint }}
          aria-hidden
        />
        {label}
      </span>
      <Slider
        value={[value]}
        min={0}
        max={255}
        step={1}
        aria-label={label}
        onValueChange={([v]) => onChange(v)}
        className="min-w-0 flex-1"
      />
      <ChannelNumberInput
        label={`${label} value`}
        hideLabel
        value={value}
        onChange={onChange}
        className="w-14 shrink-0"
      />
    </div>
  )
}

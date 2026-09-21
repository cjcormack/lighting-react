import { useCallback, useEffect, useRef, useState, type KeyboardEventHandler, type ReactNode, type Ref } from 'react'
import { RgbColorPicker, type RgbColor } from 'react-colorful'
import { Slider } from '@/components/ui/slider'
import { numericSeed } from '@/components/sheet/cells/useCellEditorKeyboard'
import { parseCssRgb } from '@/lib/colourMath'
import { cn } from '@/lib/utils'
import { ChannelNumberInput } from './ChannelNumberInput'
import { ExtendedChannelSlider } from './ExtendedChannelSlider'

/** The whole of what this editor writes: three colour bytes and the three bundled emitters. */
export interface ColourChannels {
  r: number
  g: number
  b: number
  w: number
  a: number
  uv: number
}

export interface ColourPickerBodyProps {
  /** Current RGB channel values */
  r: number
  g: number
  b: number
  /** Current extended channel values (undefined when fixture lacks the channel) */
  w?: number
  a?: number
  uv?: number
  /**
   * Combined preview CSS colour (includes W/A/UV effect): what the picker's knob is seeded from on
   * open, and re-seeded from whenever it changes while open.
   *
   * **A host must not feed its own writes straight back in here.** `react-colorful` keeps its
   * state as HSV and reconciles the `color` prop in one effect and reports the state in another;
   * when the prop changes twice before its own state update has landed — two typed bytes in one
   * task, two desk echoes in one batch — the second effect sees the *previous* HSV against the
   * *new* cache and fires `onChange` with the old colour. Fed back into the prop, that is a
   * ping-pong that never settles: the busk view's Colour tab did exactly this at 20 writes a second
   * until it passed a colour that moves only on *Pick* ([seedKey] beside it). The popover is fed
   * the desk's echo, which follows one write with one echo.
   */
  combinedCss: string
  /**
   * Re-seed the knob from [combinedCss] when this changes, even to the same colour — a host whose
   * `combinedCss` is a seed rather than a live value (the Colour tab) bumps it on every Pick, so
   * two Picks of one colour after a drag both move the knob back.
   */
  seedKey?: number
  /** Whether the fixture has extended channels */
  hasWhiteChannel: boolean
  hasAmberChannel: boolean
  hasUvChannel: boolean
  /** Callback when colour is picked */
  onColourChange: (r: number, g: number, b: number, w?: number, a?: number, uv?: number) => void
  /** Rendered above the picker. See `ColourPickerPopover`. */
  notice?: ReactNode
  /** Draw the typed R/G/B and per-emitter fields. See `ColourPickerPopover`. */
  channelFields?: boolean
  /** Spend less height: a shorter picker and the emitter rows beside it. See `ColourPickerPopover`. */
  compact?: boolean
  /**
   * Let the picker take the row's width rather than `index.css`'s fixed 200px — the busk view's
   * side sheet, which is dragged to width and whose picker used to sit at 200px in a 480px
   * column. The height stays pinned: a taller square is not a better one.
   */
  fluid?: boolean
  /** The character a keyboard-opened editor lands in the R box. See `ColourPickerPopover`. */
  keyboardOpen?: string | null
  /**
   * Whether the editor is showing. The picker re-seeds from [combinedCss] and drops its pending
   * write on every open — a popover passes its open state, a sheet that mounts the body only
   * while showing passes `true`.
   */
  open: boolean
  /** The host's keyboard wiring (`useCellEditorKeyboard`), when it has one. */
  contentRef?: Ref<HTMLDivElement>
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
}

function isExactWhite(color: RgbColor): boolean {
  return color.r === 255 && color.g === 255 && color.b === 255
}

/** An rgb() or #rrggbb CSS colour as RGB bytes, black for anything else. */
export function parseCssColour(css: string): RgbColor {
  return parseCssRgb(css) ?? { r: 0, g: 0, b: 0 }
}

/**
 * The colour editor's **body** — the react-colorful picker, the typed R/G/B, the emitter rows —
 * and the state that makes it one editor: the picker's own colour, and the six-channel buffer of
 * what it last asked for.
 *
 * Extracted from `ColourPickerPopover` so the busk view's Colour tab can host the same editor in a
 * sheet rather than a popover (busk-further plan D8, `Sheets.dc.html`): one body, three hosts,
 * so the sheet and the grid's cell cannot answer a drag or a typed byte differently. The popover
 * keeps the open state, the keyboard wiring and the two surfaces; what moved here is exactly what
 * a host must not be able to vary.
 */
export function ColourPickerBody({
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
  channelFields = false,
  compact = false,
  fluid = false,
  keyboardOpen = null,
  open,
  seedKey = 0,
  contentRef,
  onKeyDown,
}: ColourPickerBodyProps) {
  // Track the picker's internal colour state (initialized from combined preview)
  const [pickerColor, setPickerColor] = useState<RgbColor>(() => parseCssColour(combinedCss))

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
   * is spent. The open effect drops it too, which bounds a write the desk refused outright (props
   * never move, so the effect never fires) to a single editing session.
   */
  const pendingRef = useRef<ColourChannels | null>(null)
  useEffect(() => {
    pendingRef.current = null
  }, [r, g, b, w, a, uv])

  // Reset picker colour to combined preview when the editor opens, and whenever the preview or
  // the seed moves while it is open. See [combinedCss] for why a host must not route its own
  // writes through here.
  useEffect(() => {
    if (open) {
      setPickerColor(parseCssColour(combinedCss))
      pendingRef.current = null
    }
  }, [open, combinedCss, seedKey])

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
  const currentChannels = (): ColourChannels =>
    pendingRef.current ?? { r, g, b, w: w ?? 0, a: a ?? 0, uv: uv ?? 0 }
  // The render-time reading, for what the fields and sliders display.
  const channels = currentChannels()

  /**
   * The one write. Every handler builds a whole six-channel value and hands it here, so the
   * "an emitter the head hasn't got is `undefined`, not 0" mapping is stated once instead of once
   * per handler — it is the same three lines that used to sit in four places.
   */
  const send = useCallback(
    (next: ColourChannels) => {
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
  const setChannel = (channel: keyof ColourChannels, value: number) => {
    // **The knob is deliberately not moved to follow the number.** `RgbColorPicker` keeps its state
    // as HSV and converts back on the way out, and that round trip is lossy for most colours — so
    // pushing a typed RGB in as its `color` makes it fire `onChange` straight back with a value a
    // point or two off (200,20,30 comes back 199,…). That echo is indistinguishable from a drag, so
    // it lands in `handleColourChange`, which is the whole-output gesture: it would zero every
    // emitter the operator had set, on some colours and not others. The knob staying put until the
    // editor is reopened is the cheaper wrong thing; the cell's own swatch tracks the value.
    send({ ...currentChannels(), [channel]: value })
  }

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

  return (
    // Compact turns the column into a **wrapping row**, so the emitter sliders sit beside the
    // picker instead of under it. That is the change that makes it fit: stacked, the editor is
    // ~260px in the ~285px a landscape iPhone has left after Safari, and every trim that got it
    // under was taking something away. Side by side it is the height of the picker alone. The
    // wrap is what makes it one layout rather than two — a narrow sheet stacks it again, which is
    // the portrait arrangement unchanged.
    <div
      ref={contentRef}
      onKeyDown={onKeyDown}
      data-colour-picker-body={compact ? 'compact' : 'full'}
      className={compact ? 'flex flex-wrap items-start gap-4' : 'space-y-3'}
    >
      {notice}
      {/* The picker leads and the numbers sit beside it: nobody thinks in bytes when they are
          choosing a colour, and nobody wants a picker when they already know the number. The
          numbers are opt-in — see `channelFields`. */}
      {/* `react-colorful` sizes itself in CSS, and `index.css` already pins it — with `!important` —
          so the compact size is a class defined beside those rules rather than a Tailwind arbitrary
          variant, which would lose to them. It goes on the row that is here anyway rather than on a
          wrapper of its own: this body is shared by every host, so a wrapper would have added a
          bare `<div>` to the two property visualizers as a side effect of a change that is none of
          their business. The row is an ancestor of `.react-colorful` either way.

          The title sits here for the same reason, and reads better for it — it is about the picker
          *and* the boxes beside it, which is precisely this row. */}
      <div
        // Fluid *and* compact: the compact wrapper above is a wrapping flex row, so this row is a
        // content-sized flex item there, and a picker told to take the row's width had a row the
        // width of the R/G/B boxes to take — 0px of square. `flex-1` with a 16rem basis gives the
        // row the wrapper's width to fill (the emitter column wraps under it when there is not
        // room for both), and is inert in the non-compact block layout.
        className={cn(
          'flex items-start gap-3',
          compact && 'colour-picker-compact',
          fluid && 'colour-picker-fluid min-w-0 flex-1 basis-[16rem]',
        )}
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

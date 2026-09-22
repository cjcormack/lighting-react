import { useState, useCallback } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { EditorSurface } from '@/components/editor/EditorSurface'
import { useEditorKeyboard } from '@/components/editor/useEditorKeyboard'
import { ColourPickerBody } from './ColourPickerBody'

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
   * neither — `ColourCell` does, so the container's request (Enter over a selection, or the
   * selection bar's Set) can open the picker with no click; the two property visualizers have no
   * such door to offer and leave it uncontrolled.
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
   * (`EditorSurface`) — instead of always being a floating popover.
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
   * Set by `ColourCell` from `useEditorCramped()`, which is a height question rather than a
   * form one — see that hook.
   */
  compact?: boolean
  /**
   * This editor was opened by a character typed at the grid, which lands in the **R** box as its
   * first keystroke. Null or absent for a click or a released marquee, which carry no character.
   *
   * It says nothing about *focus* — R is focused however the editor was opened; see
   * `useEditorKeyboard`. `ColourCell`'s alone, like [channelFields].
   */
  keyboardOpen?: string | null
  /**
   * `ColourCell`'s, and meaningless without [sheetWhenNarrow] — the plain-popover branch below is
   * the two visualizers', where a click on the swatch is the only way in. See `CellClickBehaviour`.
   */
  triggerOpens?: boolean
  /** `ColourCell`'s. See `EditorSurface`'s own `anchorRef`. */
  editorAnchorRef?: React.RefObject<HTMLElement | null>
  /** The trigger element (swatch) */
  children: React.ReactNode
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
  triggerOpens,
  editorAnchorRef,
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
  // Enter closes, comma steps R → G → B → the emitters and round again, and a keyboard-opened
  // editor focuses R. Shared with the four cell editors, which is the point: this popover *is* the
  // colour cell's editor. The two property visualizers pass no `keyboardOpen`, so nothing here
  // takes focus for them; their popovers hold no text field to type Enter or a comma into either.
  const { contentRef, onKeyDown, onOpenAutoFocus } = useEditorKeyboard({
    // The two property visualizers draw no text fields here (see [channelFields]), so there is
    // nothing for focus to land on and taking it would only move it off the swatch they opened.
    autoFocus: channelFields,
    onDone: useCallback(() => setIsOpen(false), [setIsOpen]),
  })

  // Everything the editor *is* — the picker, the fields, the emitter rows and the six-channel
  // buffer — lives in `ColourPickerBody`, which the busk view's Colour tab hosts in a sheet. This
  // component is the popover half: the open state, the keyboard wiring and the two surfaces.
  const body = (
    <ColourPickerBody
      r={r}
      g={g}
      b={b}
      w={w}
      a={a}
      uv={uv}
      combinedCss={combinedCss}
      hasWhiteChannel={hasWhiteChannel}
      hasAmberChannel={hasAmberChannel}
      hasUvChannel={hasUvChannel}
      onColourChange={onColourChange}
      notice={notice}
      channelFields={channelFields}
      compact={compact}
      keyboardOpen={keyboardOpen}
      open={isOpen}
      contentRef={contentRef}
      onKeyDown={onKeyDown}
    />
  )

  if (sheetWhenNarrow) {
    return (
      <EditorSurface
        open={controlledOpen}
        onOpenChange={setIsOpen}
        title={title}
        contentClassName="w-auto"
        onOpenAutoFocus={onOpenAutoFocus}
        trigger={children}
        triggerOpens={triggerOpens}
        anchorRef={editorAnchorRef}
        // Alone among the cell editors: see [compact], and `wide` on the surface.
        wide
      >
        {body}
      </EditorSurface>
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

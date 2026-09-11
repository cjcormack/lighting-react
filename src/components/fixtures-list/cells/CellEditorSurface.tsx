import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

/**
 * Below this **width** a cell editor is a bottom sheet instead of a floating popover.
 *
 * Deliberately the `sm` breakpoint the sheet primitive itself uses for `sm:max-w-sm`: below the
 * width at which a sheet stops filling the screen is exactly the width at which a popover stops
 * having room. A portrait phone is ~390px, so a 256px popover anchored at a cell sits over most of
 * the grid, lands wherever floating-ui can fit it rather than where the thumb is, and has to be
 * dismissed by tapping a strip of screen the operator cannot see.
 */
export const CELL_EDITOR_SHEET_QUERY = '(max-width: 639px)'

/**
 * The space plan's short-viewport fold, spelled for `matchMedia` — a **short** viewport gets a
 * right-hand sheet instead.
 *
 * Duplicated rather than imported, which is the convention `shortViewport.test.ts` enforces across
 * every site that folds at this height; that file pins the five spellings against each other. The
 * number is the same one because the fact is the same one — there is not enough vertical space —
 * even though what each site does about it differs.
 *
 * A landscape phone is the case this exists for: 852×393 before Safari's chrome, perhaps 330px of
 * viewport after it. That is wider than [CELL_EDITOR_SHEET_QUERY], so the editor was a popover
 * there — and the colour editor is ~440px tall, so floating-ui had nowhere to put it and flipped
 * and clipped it by turns. A bottom sheet would be no better: it needs the height it has not got.
 * A full-height panel down the right edge has the one axis a short viewport still has to spend,
 * and scrolls in the axis it has not.
 */
const SHORT_VIEWPORT = '(max-height: 500px)'

/**
 * Below this viewport **height**, a tall editor draws its compact layout — in whichever of the
 * three forms it is in.
 *
 * Only the colour editor is tall enough to care; the other three are a slider and a label. Its
 * full layout is a 357px popover, and a popover has to fit *beside* the cell it belongs to, which
 * can be anywhere in the grid — so the room it actually gets is roughly half the viewport. Below
 * ~725px there is a band of the grid where neither side has 357px and Radix will not rescue it:
 * it flips above the cell and then `limitShift` refuses to slide it back down, because that would
 * cover the very cell it is anchored to. The editor renders at a negative `top` and is clipped by
 * the window, silently. 750 is that figure with a little margin.
 *
 * A **height** rule and not a form rule, which is why it is not folded into `useCellEditorForm`:
 * the bottom sheet on an upright phone has all the height in the world and should keep the full
 * layout, while a short desktop window has none and is still a popover.
 *
 * This is a second `max-height` in this file, and the reason `shortViewport.test.ts` keeps it out
 * of `SITES` matters more for it: that test asserts *every* `max-height` in a listed file is 500.
 * The spelling check it is in still pins `SHORT_VIEWPORT` above.
 */
const CRAMPED_VIEWPORT = '(max-height: 750px)'

/** Which of the three shapes a cell editor is drawing itself as. */
export type CellEditorForm = 'popover' | 'bottom-sheet' | 'side-sheet'

/**
 * One `matchMedia` and one listener **per query**, however many cells are mounted.
 *
 * A `useMediaQuery` per cell would be a `matchMedia` call and a `change` listener per *cell* — the
 * grid mounts one editor per visible cell, so a rig of any size means hundreds of both, all
 * answering the same two questions. Each query's answer is cached in this module and pushed to its
 * subscribers, so `getSnapshot` is a variable read (`useSyncExternalStore` calls it on every render
 * of every subscriber, so it must not build anything — including the subscribe/snapshot closures,
 * which have to be stable per query or the store resubscribes on every render).
 */
interface MediaEntry {
  matches: boolean
  listeners: Set<() => void>
  subscribe: (onStoreChange: () => void) => () => void
  getSnapshot: () => boolean
  /** Undone by [resetCellEditorSurfaceMedia]; absent where there is no `matchMedia` to listen to. */
  dispose?: () => void
}

const mediaEntries = new Map<string, MediaEntry>()

function mediaEntry(query: string): MediaEntry {
  const existing = mediaEntries.get(query)
  if (existing) return existing

  const entry: MediaEntry = {
    matches: false,
    listeners: new Set(),
    subscribe: (onStoreChange) => {
      entry.listeners.add(onStoreChange)
      return () => {
        entry.listeners.delete(onStoreChange)
      }
    },
    getSnapshot: () => entry.matches,
  }
  mediaEntries.set(query, entry)

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const list = window.matchMedia(query)
    entry.matches = list.matches
    const onChange = (event: MediaQueryListEvent) => {
      entry.matches = event.matches
      for (const listener of entry.listeners) listener()
    }
    list.addEventListener('change', onChange)
    entry.dispose = () => list.removeEventListener('change', onChange)
  }
  return entry
}

/**
 * Drop the cached `matchMedia` answers, so a test that stubs `window.matchMedia` is not answered by
 * a stub from an earlier test. The cache outlives a `cleanup()`, being module state.
 *
 * The native listener goes too. Clearing the map alone left it registered on the old
 * `MediaQueryList`, still writing into an entry nothing can read any more and notifying subscribers
 * that had moved on to a fresh entry for the same query — so a suite that reset between tests
 * accumulated one live listener per reset, and the count a test made of them (the "one listener per
 * query" assertion) would have been measuring the wrong thing.
 */
export function resetCellEditorSurfaceMedia(): void {
  for (const entry of mediaEntries.values()) entry.dispose?.()
  mediaEntries.clear()
}

function useSharedMedia(query: string): boolean {
  const entry = mediaEntry(query)
  // Server snapshot is `false`: a popover is the shape every existing test and the SSR-less build
  // already expect, and a wrong guess here would swap the whole editor on hydration.
  return useSyncExternalStore(entry.subscribe, entry.getSnapshot, () => false)
}

/**
 * Whether a tall cell editor should draw its compact layout. See [CRAMPED_VIEWPORT].
 *
 * Separate from the form on purpose — a popover, a bottom sheet and a side sheet can each be short
 * of height, and only the editor knows whether it is tall enough for the question to arise.
 */
export function useCellEditorCramped(): boolean {
  return useSharedMedia(CRAMPED_VIEWPORT)
}

/**
 * Which shape a cell editor should take here.
 *
 * **Short beats narrow.** A viewport that is both — a small phone in landscape, a short browser
 * window — has no vertical room to give a bottom sheet, which is the one thing a bottom sheet
 * needs; the side sheet is the arm that works with what is left.
 *
 * It is also the honest answer to "is this a touch surface", which is why `SettingCell` reads it
 * for its row height: both sheets are reached by a finger and the popover is not. A `sm:` variant
 * cannot say that — see the note there.
 */
export function useCellEditorForm(): CellEditorForm {
  const narrow = useSharedMedia(CELL_EDITOR_SHEET_QUERY)
  const short = useSharedMedia(SHORT_VIEWPORT)
  if (short) return 'side-sheet'
  return narrow ? 'bottom-sheet' : 'popover'
}

/**
 * How much of the layout viewport the on-screen keyboard is covering, in CSS pixels.
 *
 * A sheet is `position: fixed`, which on iOS is laid out against the **layout** viewport — and
 * that does not shrink when the keyboard opens. So a sheet holding a number field (the dimmer
 * editor, the colour editor's R/G/B boxes, the marquee's typed value) would slide itself neatly
 * behind the keyboard the instant it was used. `visualViewport` is the only thing that reports the
 * covered strip; both sheet forms give the strip back — the bottom one by rising, the side one by
 * shortening.
 *
 * Only measured while the sheet is [open], so a closed editor costs no listeners.
 */
function useKeyboardInset(open: boolean | undefined): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const viewport = typeof window === 'undefined' ? undefined : window.visualViewport
    if (!open || !viewport) {
      setInset(0)
      return
    }
    const update = () => {
      // `offsetTop` is how far the visual viewport has been scrolled *down* inside the layout
      // viewport; without it, a page pinch-scrolled to the bottom reads as a keyboard.
      const hidden = window.innerHeight - viewport.height - viewport.offsetTop
      setInset(Math.max(0, Math.round(hidden)))
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [open])

  return inset
}

interface CellEditorSurfaceProps {
  /** Undefined leaves the popover to hold its own state — the two property visualizers do. */
  open?: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Names the property in a **sheet**'s header. The popover has no header, so this is unused
   * there — but it is required rather than optional, because a sheet is a Radix dialog and a
   * dialog with no title is unreadable to a screen reader.
   */
  title: string
  /**
   * The cell's own button.
   *
   * Required in practice, though the type still allows its absence: this surface also took an
   * `anchor` rect for a trigger-less popover, which existed for `CellEntryPopover` alone — an
   * editor opened by Enter over a marquee, pointed at a cell it knew only by `(rowId, col)`. The
   * keyboard opens the cell's own editor now, so every caller has a trigger and that branch went
   * with it.
   */
  trigger?: ReactNode
  /**
   * Popover only: its **width**. A sheet sizes itself against the screen.
   *
   * Not its rhythm any more. Each editor wraps its own controls in the element that carries
   * `useCellEditorKeyboard`'s ref and key handler, and the spacing rides on that — so one number
   * applies in all three forms, rather than the popover's coming from here and both sheets'
   * from `SheetBody`'s own `space-y-4` between what used to be its direct children.
   */
  contentClassName?: string
  /** Popover only. */
  align?: 'start' | 'center' | 'end'
  /**
   * Both primitives spell this the same way. Every cell editor passes `useCellEditorKeyboard`'s,
   * which is how the first text field takes focus on open — in that callback rather than in an
   * effect, because Radix's own auto-focus is a parent effect and would take it straight back.
   */
  onOpenAutoFocus?: (event: Event) => void
  /**
   * This editor's content needs the **wide** side sheet.
   *
   * Only the colour editor does: on a short viewport it lays its emitter rows beside the picker
   * rather than under them, which is what stops it scrolling, and that wants ~528px of content.
   * The other three are a slider and a label, and looked absurd in that much room — so the width
   * is the content's to ask for rather than one number for the surface. It says nothing about the
   * bottom sheet (as wide as the screen) or the popover (sized by `contentClassName`).
   */
  wide?: boolean
  children: ReactNode
}

/**
 * The one surface every cell editor opens in: a floating popover on a desk, a bottom sheet on a
 * phone held upright, a right-hand sheet where the viewport is short.
 *
 * Written once rather than four times, for the four cell editors — `SliderCell`, `PositionCell`,
 * `SettingCell`, and `ColourCell` through `ColourPickerPopover`. There was a fifth, the marquee's
 * own typed-value field (`CellEntryPopover`), drawn through this surface precisely so that Enter
 * and a click would produce the same picture. It is deleted: the keyboard now opens the cell's
 * *own* editor, which is the stronger form of that argument — one editor per column rather than
 * two that have to be kept looking alike. See §The programmer's keyboard in CLAUDE.md.
 *
 * The two sheet forms share a component so a rotation between them cannot be the moment one of
 * them grows a rule the other has not got; the popover is its own branch so that a desk pays for
 * no viewport listener at all.
 */
export function CellEditorSurface({
  open,
  onOpenChange,
  title,
  trigger,
  contentClassName,
  align = 'start',
  onOpenAutoFocus,
  wide,
  children,
}: CellEditorSurfaceProps) {
  const form = useCellEditorForm()

  if (form !== 'popover') {
    return (
      <SheetSurface
        form={form}
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        trigger={trigger}
        onOpenAutoFocus={onOpenAutoFocus}
        wide={wide}
      >
        {children}
      </SheetSurface>
    )
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {trigger != null && <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
      <PopoverContent
        data-cell-editor-surface="popover"
        align={align}
        className={contentClassName}
        onOpenAutoFocus={onOpenAutoFocus}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}

function SheetSurface({
  form,
  open,
  onOpenChange,
  title,
  trigger,
  onOpenAutoFocus,
  wide,
  children,
}: Pick<
  CellEditorSurfaceProps,
  'open' | 'onOpenChange' | 'title' | 'trigger' | 'onOpenAutoFocus' | 'wide' | 'children'
> & { form: Exclude<CellEditorForm, 'popover'> }) {
  const keyboardInset = useKeyboardInset(open)
  const atBottom = form === 'bottom-sheet'

  // Inline rather than Tailwind because most of these are computed, and because each of them has
  // to beat a class `SheetContent` already carries — `bottom-0`, `w-full`, `h-full` — which only an
  // inline style does. `viewport-fit=cover` in index.html is what makes the `env()` insets non-zero,
  // and the padding here is the device's strip only: the visual rhythm is `SheetBody`'s `pb-4`.
  const style: CSSProperties = {
    paddingBottom: keyboardInset > 0 ? 0 : 'env(safe-area-inset-bottom)',
    ...(atBottom
      ? {
          bottom: keyboardInset,
          // `svh`, not `dvh`: the dynamic unit changes as Safari's bar hides and shows, which
          // would resize the sheet under the operator's thumb mid-drag. The small viewport is the
          // one that is always true.
          maxHeight: `calc(88svh - ${keyboardInset}px)`,
        }
      : {
          // [wide] is the colour editor's, which needs room to sit its emitter rows *beside* the
          // picker — the thing that stops it scrolling in the ~285px a landscape iPhone actually
          // has once Safari has taken its share. The safe-area inset is added to the width rather
          // than merely padded in: as padding alone it came off the content box, and the picker
          // and its field column no longer fitted, so the sheet scrolled sideways on whichever
          // rotation puts the notch on this edge.
          width: `calc(${wide ? 'min(35rem, 70vw)' : 'min(22rem, 85vw)'} + env(safe-area-inset-right))`,
          // `SheetContent`'s own `sm:max-w-sm` is a 384px cap that silently wins over the width
          // above — the sheet simply stayed narrow and the body scrolled, which looks like the
          // width never being applied at all. The `vw` term in the width is the real cap.
          maxWidth: 'none',
          // Replaces `h-full`, which would otherwise over-constrain the box and make the
          // keyboard's bite be ignored outright.
          height: `calc(100% - ${keyboardInset}px)`,
          // Landscape puts the notch on one side or the other, and `env()` is 0 on the side it is
          // not; a sheet flush to the right edge would otherwise put its body under it.
          paddingRight: 'env(safe-area-inset-right)',
        }),
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger != null && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent
        data-cell-editor-surface={form}
        side={atBottom ? 'bottom' : 'right'}
        // A cell editor is its own description: there is nothing to say beyond the title, and
        // Radix warns about a dialog that neither describes itself nor opts out.
        aria-describedby={undefined}
        // The house shape for a sheet that is a panel rather than a form: `p-0 gap-0` with the
        // padding pushed into the header and body, a ruled header, and square corners. Copied from
        // `AiChatPanel` and `MobileCueListSheet` rather than invented, because a cell editor
        // arriving in its own dialect is exactly what makes an app feel assembled from parts.
        className="p-0 gap-0"
        style={style}
        onOpenAutoFocus={onOpenAutoFocus}
      >
        <SheetHeader className="flex-none border-b py-3 pl-4 pr-10">
          <SheetTitle className="text-base">{title}</SheetTitle>
        </SheetHeader>
        {/* `pt-4`: `SheetBody` has no top padding of its own, so the first control sat hard
            against the header's rule. */}
        <SheetBody className="pt-4">{children}</SheetBody>
      </SheetContent>
    </Sheet>
  )
}

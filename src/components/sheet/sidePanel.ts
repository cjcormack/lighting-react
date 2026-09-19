import { useState } from 'react'

/**
 * **One docked side panel, stated once** — the programmer's rail and the busk view's side sheet.
 *
 * The two are the same instrument: a column against the right edge of a live view, folded to a
 * narrow strip of glyphs when it is not wanted, carrying a 40px header over a scroller. They were
 * built a session apart and had drifted in every measurement that is supposed to be the chrome
 * system's — the rail's body is an opaque fill on a 40px header with 40px strip cells, the sheet's
 * was a transparent column on a 36px header with a 44px strip and `p-1` glyph buttons — so the two
 * read as two surfaces rather than one idea in two places. `sheetFrame.ts` is the precedent and
 * the model: the class strings live here, each surface imports the ones it needs, and a surface
 * that wants to differ says so at its own import.
 *
 * What is deliberately **not** here: the panel's state. The rail's `collapsed` is a persisted desk
 * preference in `ProgrammerWorkspace`; the sheet's fold is `busk.sheet === 'none'`, a per-tab fact
 * that rides the window announce and is written by ⌘K, the Screens sheet and MIDI besides. Those
 * are different facts about different things and folding them together would make one surface's
 * fold reach the other's view.
 */

/**
 * The panel body: one left edge, and an **opaque** fill mixed from the card tint and the page
 * background rather than `bg-card/40`. Docked, a 40% tint over the page reads the same — but both
 * panels have an overlay arm that sits over live content, and a translucent panel let the row
 * beneath it bleed through.
 */
export const SIDE_PANEL_BODY_CLASS =
  'flex min-h-0 flex-col border-l bg-[color-mix(in_oklab,var(--card)_40%,var(--background))]'

/**
 * **There is no header class here, deliberately.** A panel's header is a 40px chrome row like any
 * other, so both surfaces import `CHROME_ROW_CLASS` from `sheetFrame.ts` directly. A
 * `SIDE_PANEL_HEADER_CLASS` beside it would have been byte-for-byte the same string under a
 * second name — one measurement stated twice, which is the drift this module and that one both
 * exist to close.
 */

/**
 * The folded strip: 40px of glyphs, not the 44px of a touch handle. The programmer's phone arm is
 * the one that is 44 (`RailHandleFrame`), and it says why — it is a target for a finger, where
 * this is a column read with a mouse on the desk board. Both panels' strips are drawn only on a
 * board wide enough to dock, so neither is ever the phone's.
 */
export const SIDE_PANEL_STRIP_CLASS = 'flex w-10 shrink-0 flex-col items-center border-l bg-card/40'

/** A cell of the strip — a full-width 40px square with the strip's own dividing line under it. */
export const SIDE_PANEL_STRIP_CELL_CLASS =
  'h-10 w-10 shrink-0 rounded-none border-b text-muted-foreground'

/** The header's own chevron: the third control tier, a control inside a control. */
export const SIDE_PANEL_HEADER_BUTTON_CLASS = 'size-6 text-muted-foreground'

/**
 * The enter animation, played once when the panel opens. Slide plus fade from the right, because
 * both panels arrive from the right edge and both leave a strip behind them — a bare fade would
 * not say where the column came from.
 *
 * There is deliberately **no exit animation**. An exiting panel has to stay mounted for the length
 * of it, which for these two means holding a layer list, an FX list and their subscriptions —
 * or a colour picker mid-drag — alive after the operator has asked for them to go. The ask was to
 * animate the opening, and opening is the half that can be done without keeping state alive past
 * its welcome.
 */
export const SIDE_PANEL_ENTER_CLASS =
  'animate-in fade-in-0 slide-in-from-right-4 duration-200 ease-out'

/**
 * Whether the panel should play its enter animation this render.
 *
 * True from the render in which `open` turns on until it turns off again — **latched**, not
 * derived per render, and that is the whole point: `animate-in` is a class, so a re-render that
 * dropped it mid-flight would cut the animation off part-way, and both panels re-render freely
 * while open (a layer arrives, a marquee moves, a tempo ticks).
 *
 * False on the **first** render whatever `open` says, so a panel that is already open when the
 * view mounts is simply there rather than sliding in on every arrival at the route. That is the
 * common case on both surfaces — the rail's collapsed flag is a stored preference, the sheet's
 * tab is a stored per-window fact — so without it the animation would fire on every navigation
 * and on every reload.
 *
 * This is React's documented "adjust state while rendering" pattern rather than an effect: an
 * effect runs after paint, so the class would land one frame late and the panel would flash into
 * its final position before sliding from it.
 *
 * It must be called from a component that **outlives the panel**, since a panel unmounted while
 * folded takes any hook inside it along: `ProgrammerRail` and `SideSheet` both render the strip
 * or the body and stay mounted across the swap, which is why the flag is computed there and
 * handed down rather than read inside the frame.
 */
export function usePanelEnter(open: boolean): boolean {
  const [previous, setPrevious] = useState(open)
  const [enter, setEnter] = useState(false)
  if (previous !== open) {
    setPrevious(open)
    setEnter(open)
  }
  return enter
}

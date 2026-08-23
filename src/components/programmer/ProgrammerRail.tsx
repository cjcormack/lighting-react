import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { FxSheet } from './FxSheet'
import { ProgrammerFxList } from './ProgrammerFxList'
import { ProgrammerLookStack } from './ProgrammerLookStack'

/**
 * The layer stack and the running effects, side by side with the value grid rather than behind
 * tabs — the three readings of one live object, all on screen.
 *
 * **Session 2 moves this.** It replaces the right-hand rail with a ~322px LEFT-hand stack rail that
 * merges both bands into one list under a shared `+ Look / + Template / + Effect` footer, with a
 * values/effects boundary drawn between them. Nothing outside `ProgrammerWorkspace` may assume
 * which side it is on or how wide it is, and the two sections deliberately do not share an "Add"
 * affordance yet, because that footer is where those end up.
 */
export function ProgrammerRail() {
  const [diagnosticOpen, setDiagnosticOpen] = useState(false)

  return (
    // `flex-1` pairs with the wrapper's `flex min-h-0 flex-col` in `ProgrammerWorkspace`: together
    // they give this box a bounded height, which is what makes `overflow-y-auto` actually scroll.
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <ProgrammerLookStack />
      <div className="border-t pt-3">
        <ProgrammerFxList />

        {/* The per-fixture FX view, closed by default and MOUNTED ONLY WHEN OPEN.
            That is the one part of the old tabbed pane's reasoning worth keeping: `FxSheet` builds
            the whole fixture row model a second time, renders every row unvirtualized, and
            subscribes to `useProgrammerRevision`, which fires on every programmer event — including
            each 30 Hz commit tick from the grid beside it. Always-mounted would mean re-rendering a
            200-row tree at 30 Hz while the operator drags a fader. Behind one click it costs
            nothing until it is asked for, and it is still the only place per-fixture suppression
            and programmer-ownership are visible. */}
        <button
          type="button"
          onClick={() => setDiagnosticOpen((open) => !open)}
          aria-expanded={diagnosticOpen}
          className="mt-2 flex w-full items-center gap-1.5 rounded px-1 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
        >
          {diagnosticOpen ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
          Per-fixture FX
        </button>
        {diagnosticOpen && (
          <div className="pt-1">
            <FxSheet />
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect } from 'react'
import { AudioWaveform, ChevronDown, ChevronRight, Layers, SlidersVertical, TableProperties } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePersistentState } from '../../hooks/usePersistentState'
import { useProgrammerSummaryQuery } from '../../store/programmer'
import { FxSheet } from './FxSheet'
import { ProgrammerLookStack } from './ProgrammerLookStack'
import { ProgrammerSheet } from './ProgrammerSheet'

const OPEN_KEY = 'program.programmerPane'
const TAB_KEY = 'program.programmerTab'

type ProgrammerTab = 'values' | 'layers' | 'fx'

/**
 * The programmer, embedded in the Program view, so busking a look and shaping the cue it belongs to
 * happen on one screen — the flow Include → edit → Update is built around.
 *
 * This is the whole programmer, not a slice of it: `/programmer` and `/programmer/fx` redirect here,
 * and the three tabs are what those two routes used to be plus the layer stack that had no home.
 * They are tabs inside the pane rather than a sibling route each, because they are three readings of
 * one live object — the values it holds, the looks it is composed from, and the effects running over
 * it — rather than three destinations.
 *
 * Collapsed by default and persisted: Program is primarily a cue-authoring surface, and the sheet is
 * tall enough that always-open would push the cue list off-screen.
 */
export function ProgrammerPane() {
  const [open, setOpen] = usePersistentState<boolean>(OPEN_KEY, false)
  const [tab, setTab] = usePersistentState<ProgrammerTab>(TAB_KEY, 'values')
  const { data: summary } = useProgrammerSummaryQuery()

  // FX is a diagnostic read of what is running, so landing there because you last looked at it —
  // rather than on the values you came to edit — is the wrong default. Carrying it *within* a
  // session is useful; carrying it across a reload is what the old switcher refused to do.
  useEffect(() => {
    if (tab === 'fx') setTab('values')
    // Once, on mount: re-running this on every `tab` change would make the FX tab unselectable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const entryCount = summary?.entryCount ?? 0
  const blind = summary?.blind ?? false

  return (
    <div className="border-b">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/30"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <SlidersVertical className="size-3.5" />
        Programmer
        {/* Surfaced on the collapsed header too — the whole point of the indicator is that
            you never have to open something to learn the programmer is holding values. */}
        {entryCount > 0 && (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] tabular-nums text-primary">
            {entryCount}
          </span>
        )}
        {blind && (
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
            Blind
          </span>
        )}
      </button>
      {open && (
        <div className="max-h-[45vh] overflow-auto px-4 pb-3">
          <Tabs value={tab} onValueChange={(next) => setTab(next as ProgrammerTab)}>
            <TabsList>
              <TabsTrigger value="values">
                <TableProperties className="size-3.5" />
                <span className="hidden sm:inline">Values</span>
              </TabsTrigger>
              <TabsTrigger value="layers">
                <Layers className="size-3.5" />
                <span className="hidden sm:inline">Layers</span>
              </TabsTrigger>
              <TabsTrigger value="fx">
                <AudioWaveform className="size-3.5" />
                <span className="hidden sm:inline">FX</span>
              </TabsTrigger>
            </TabsList>
            {/* Radix mounts only the active tab's content, which is load-bearing for **FX**: the
                values and FX sheets each build the whole fixture row model, and mounting both
                would do it twice for a pane that shows one.

                Values is `forceMount`ed anyway, and it is not an exception to that argument — it
                is the reason for it. `useListSelection` clears its scope on unmount, and its
                comment explains why a plain teardown clear was safe: "only one list per scope is
                ever mounted at a time (the three scopes belong to mutually exclusive routes)".
                Tabs broke that premise. Without this, glancing at the layer stack silently
                discards the fixture selection that Record and Record-look scope on. It costs
                nothing new either — before the tabs, this pane rendered `ProgrammerSheet`
                unconditionally whenever it was open. */}
            <TabsContent value="values" forceMount hidden={tab !== 'values'}>
              <ProgrammerSheet />
            </TabsContent>
            <TabsContent value="layers">
              <ProgrammerLookStack />
            </TabsContent>
            <TabsContent value="fx">
              <FxSheet />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}

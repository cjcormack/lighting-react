import { useMemo } from 'react'
import { Layers, MousePointerSquareDashed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LayerLegend, OwnershipLegend } from '@/components/fixtures-list/OwnershipLegend'
import { Badge } from '@/components/ui/badge'
import {
  describeCellScope,
  type CellRef,
} from '@/components/fixtures-list/cellSelectionModel'
import { formatFamilyList, type AttributeFamily } from '@/lib/attributeFamily'
import { cellFamilies, COLUMN_DEFS, type ColumnKey } from '@/components/fixtures-list/columns'
import type { ColumnVisibility } from '@/components/fixtures-list/ColumnsMenu'
import { FixturesListContainer } from '@/components/fixtures-list/FixturesListContainer'
import { EditorContextProvider } from '@/components/programmer/EditorContext'
import { LayerRowNotices } from './LayerRowNotices'
import { MakeLayerButton, ProgrammerScopeBand } from './ProgrammerScopeBand'
import { TemplateStrip } from './TemplateStrip'
import { useLookRowStore } from './LookRowStore'
import { useProgrammerScope } from './ProgrammerScope'
import type { EditorContextValue } from '@/components/programmer/EditorContext'
import type { LocateTarget } from '@/store/locate'

/**
 * The programmer's value grid: the fixtures-list spreadsheet with per-cell ownership colouring,
 * pointed at whatever the scope band above says.
 *
 * Writes route through an `EditorContext` this component supplies itself, derived from the scope:
 * `live` for Output and Local — which since the programmer redesign means "write the programmer",
 * not "write DMX" — and `lookLayer` when a Look layer is focused. The page keeps its own outer
 * `live` provider for the *rail*, whose FX controls write the programmer whatever the grid is
 * looking at.
 *
 * **Unconditionally mounted, and that is load-bearing.** `useListSelection` clears its Redux scope
 * on unmount, so anything that mounts this conditionally — a tab, a collapse, an `{open && …}` —
 * silently discards the fixture selection that Record and Record-look scope on. The pane this
 * replaced needed a `forceMount` escape hatch for exactly that; here there is nothing to force.
 *
 * **Row B is the toolbar's first line**, and it is here rather than above the workspace because
 * everything on it — the scope, the filter, Lit, Groups, Columns — is a fact about *this grid*,
 * and a band spanning the page reached across the rail to say it. The scope band was a
 * full-width sibling of the action bar until session 1 of the space plan; `sheetControls` on the
 * action bar (which hosted Groups and Columns) went at the same time and for the same reason.
 *
 * The *state* behind Groups and Columns still lives in `ProgrammerBody`, inside the memo barrier
 * — this component renders the controls, it does not own them.
 */
/** Column labels for the scope description, from the same table the header renders. */
const COLUMN_LABELS = new Map(COLUMN_DEFS.map((d) => [d.key, d.label]))
const columnLabel = (col: ColumnKey) => COLUMN_LABELS.get(col) ?? col

export function ProgrammerGrid({
  projectId,
  grouped,
  onGroupedChange,
  columnVisibility,
  onColumnVisibilityChange,
}: {
  projectId: number
  grouped: boolean
  onGroupedChange: (next: boolean) => void
  columnVisibility: ColumnVisibility
  onColumnVisibilityChange: (next: ColumnVisibility) => void
}) {
  const scope = useProgrammerScope()
  const store = useLookRowStore()
  // Derived from the scope, and provided **unconditionally** — only the value varies, so the tree
  // shape never changes and the container below never unmounts. Rendering a different provider
  // (or a different grid) per scope is the exact hazard the doc comment above describes.
  const editorContext: EditorContextValue =
    scope?.kind === 'layer' && store
      ? { kind: 'lookLayer', layerId: scope.layerId, lookId: store.lookId }
      : { kind: 'live' }

  return (
    <EditorContextProvider value={editorContext}>
      <ProgrammerGridBody
        projectId={projectId}
        grouped={grouped}
        onGroupedChange={onGroupedChange}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={onColumnVisibilityChange}
      />
    </EditorContextProvider>
  )
}

/** The ShowBar's key-cap styling, so the two hints read as one vocabulary. */
const KBD_CLASS = 'rounded border bg-muted/50 px-1.5 py-px text-[9.5px]'

function ProgrammerGridBody({
  projectId,
  grouped,
  onGroupedChange,
  columnVisibility,
  onColumnVisibilityChange,
}: {
  projectId: number
  grouped: boolean
  onGroupedChange: (next: boolean) => void
  columnVisibility: ColumnVisibility
  onColumnVisibilityChange: (next: ColumnVisibility) => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FixturesListContainer
        grouped={grouped}
        selectionScope="programmer"
        showOwnership
        fill
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={onColumnVisibilityChange}
        // Cmd+K's ?select= links target the fixtures/groups pair; consuming them here would bounce
        // a group select straight back out to /groups/list.
        enableDeepLinkSelect={false}
        // Include auto-selects the heads it pulled in — this is where you then edit them.
        respondToIncludeSelection
        renderToolbar={({
          filter,
          lit,
          columns,
          selection,
          cells,
          cellEntryKey,
          cellClearKey,
          templateTargets,
          targetFamilies,
          targetEmitters,
        }) => (
          <div className="flex flex-col">
            {/* Row B. Its own `@container`, with every query on the child — the wrapper can never
                be measured by the classes it hosts (`ProgrammerWorkspace`'s doc comment). */}
            <div className="@container">
              <div className="flex h-9 items-center gap-2 border-b px-3">
                <ProgrammerScopeBand />
                {/* The filter gives before anything else does: it is the one control here whose
                    width is a preference rather than a size. */}
                {/* `max-w-[340px]` is the artboard's: past that the field is wider than any
                    fixture name and the row's right end starts to feel unanchored.

                    `[&>div]:min-w-0` unpicks the filter's own `min-w-48`. That floor is right in
                    the default toolbar, which *wraps*, and wrong here, where the row does not:
                    below ~1300px of page width the 192px input simply overran its flex track and
                    painted its placeholder under the Lit button. Row B has no second line to give
                    it, so the field gives instead — and session 4 replaces it with a search icon
                    at the width where even that stops being enough. */}
                <div className="flex min-w-0 max-w-[340px] flex-1 items-center gap-2 [&>div]:min-w-0">
                  {filter}
                </div>
                {lit}
                <span className="flex-1" />
                <Button
                  variant={grouped ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 shrink-0"
                  aria-pressed={grouped}
                  onClick={() => onGroupedChange(!grouped)}
                  title="Show group rows with their members"
                >
                  <Layers className="size-3.5" />
                  <span className="hidden @[800px]:inline">Groups</span>
                </Button>
                {columns}
                <MakeLayerButton />
              </div>
            </div>
            {/* The layer notices keep their padded block. They are prose, not chrome — a sentence
                about what a focused layer will and will not take — and they wrap. `empty:hidden`
                because outside layer scope they render nothing, and an always-on wrapper would
                spend 16px of padding on a page whose budget is the reason this session exists. */}
            <div className="flex flex-col gap-2 px-3 py-2 empty:hidden">
              <LayerRowNotices projectId={projectId} />
            </div>
            {/* Row C: the selection bar, and the templates ride it. Its own `@container`, with
                the queries on the child — the wrapper trap again. See `SelectionBar` below. */}
            <div className="@container">
              <SelectionBar
                projectId={projectId}
                selection={selection}
                cells={cells}
                cellEntryKey={cellEntryKey}
                cellClearKey={cellClearKey}
                templateTargets={templateTargets}
                targetFamilies={targetFamilies}
                targetEmitters={targetEmitters}
              />
            </div>
          </div>
        )}
        renderFooter={({ fixtureCount, selectedCount }) => (
          <ScopedLegend fixtureCount={fixtureCount} selectedCount={selectedCount} />
        )}
      />
    </div>
  )
}

/**
 * Row C — the selection bar, which is also where the templates now live.
 *
 * **One 34px line, and it never wraps**, which is the change session 2 of the space plan is for.
 * It used to be two bands: a full-width template strip that showed the whole library with nothing
 * selected (and wrapped to four rows on a real one), and a rounded selection card below it.
 * Together they cost ~90px of a grid's height, permanently, for a strip whose press could only
 * toast. Now the bar appears with the selection, the chips scroll sideways inside it under a fade,
 * and with nothing selected there is no band here at all.
 *
 * It is full-bleed with a `border-b` rather than a rounded card inset in a padded block: it is a
 * *rung of the grid's chrome* like row B above it, not an object floating over the page, and the
 * card's 16px of surrounding padding was height.
 *
 * **The wash is `foreground/5`, not a primary tint** (D4). Selection is neutral on this page now,
 * so that `--primary` can mean one thing — you own this value — from the ownership rings down to
 * the row wash. A blue bar over blue-ringed cells was the two facts the grid most needs to keep
 * apart sharing one colour.
 *
 * **It is a component rather than JSX inside `renderToolbar`, and that is load-bearing.**
 * `renderToolbar` is a render prop invoked during `FixturesListContainer`'s render, so a hook in
 * its body is a hook of *that* component and `react-hooks/rules-of-hooks` rejects it outright.
 * The families the marquee named have to be memoised somewhere — they are derived once here and
 * handed to `TemplateStrip` — and this is the nearest place a hook may legally live. It returns
 * `null` itself rather than being mounted conditionally, so its own hooks run in a stable order.
 */
function SelectionBar({
  projectId,
  selection,
  cells,
  cellEntryKey,
  cellClearKey,
  templateTargets,
  targetFamilies,
  targetEmitters,
}: {
  projectId: number
  selection: React.ReactNode | null
  cells: readonly CellRef[]
  cellEntryKey: boolean
  cellClearKey: boolean
  templateTargets: readonly LocateTarget[]
  targetFamilies: readonly AttributeFamily[]
  targetEmitters: readonly string[]
}) {
  // Derived once and shared with the strip below, so the badge and the chips beside it cannot
  // disagree about what is being offered — and so a marquee drag, which mints a fresh `cells`
  // array on every animation frame, pays for one pass rather than two.
  const askedFamilies = useMemo(
    () => (cells.length > 0 ? cellFamilies(cells) : null),
    [cells],
  )

  if (!selection && cells.length === 0) return null

  return (
    <div className="flex h-[34px] min-w-0 items-center gap-2 border-b bg-foreground/5 px-3">
      <MousePointerSquareDashed className="size-3.5 shrink-0" />
      {/* Two selections, both live at once, so both are counted. FIXTURE selection is what Record
          scopes on; CELL selection is a transient edit scope that only says where the next value
          goes. Leaving either to be inferred from the buttons beside it is how an operator ends up
          recording a different set from the one they meant.

          The fixture count is `templateTargets` — the heads a press actually lands on, which is
          the cells' heads under a marquee and the selected rows' otherwise — and deliberately not
          the footer's `selectedCount`, which counts visible *rows* with a group as one. Two
          numbers, two questions: the footer says how much of the list you have picked, this says
          how many heads your next gesture reaches. It replaced the bare label "Selected fixtures",
          which named the fact without answering the only question anyone asks of it. */}
      {templateTargets.length > 0 && (
        <span className="whitespace-nowrap text-xs font-semibold tabular-nums">
          {templateTargets.length} fixture{templateTargets.length === 1 ? '' : 's'}
        </span>
      )}
      {cells.length > 0 && (
        <>
          {templateTargets.length > 0 && <span className="text-muted-foreground/50">·</span>}
          <span
            className="whitespace-nowrap text-xs font-semibold tabular-nums"
            // Session 1's rule: the sentence becomes the hover. `describeCellScope` is the same
            // string the drag chip shows, so the two agree by construction.
            title={`${describeCellScope(cells, columnLabel)} — edit once, applies to all`}
          >
            {cells.length} cell{cells.length === 1 ? '' : 's'}
          </span>
          {/* The family the marquee named. The *asked* families, never the capability list a
              rows-only selection produces — badging that would read as the operator's statement
              when it is only the strip's filter. */}
          {askedFamilies != null && (
            <Badge variant="outline" className="shrink-0 whitespace-nowrap px-1.5 py-0 text-[10px]">
              {formatFamilyList(askedFamilies, ' · ')}
            </Badge>
          )}
          {/* The keyboard half: the two keys that reach the marquee's editor from the grid. The
              editor itself is a popover the container opens at the first selected cell. Both hints
              follow the container's own answer — each flag is false where its key is refused — so
              this cannot advertise a key that does nothing, and the rule
              (`cellKeyboardPermission`) is not restated here.

              `@[1100px]` is the artboard's threshold, kept literally the way session 1 kept the
              legend's: on a bar whose container is the grid column this is the first thing to go,
              and it is the right first thing — a hint, not a control. It does mean the hints are
              unreachable at today's rail width; session 3's 300px rail is what brings them back on
              a wide desk. */}
          {(cellEntryKey || cellClearKey) && (
            <span className="hidden shrink-0 items-center gap-1 whitespace-nowrap text-[10px] text-muted-foreground @[1100px]:inline-flex">
              {cellEntryKey && (
                <>
                  <kbd className={KBD_CLASS}>⏎</kbd> type a value
                </>
              )}
              {cellClearKey && (
                <>
                  <kbd className={`${KBD_CLASS} ml-1`}>⌫</kbd> clear
                </>
              )}
            </span>
          )}
        </>
      )}
      {/* The templates, on this line since session 2: a hairline, the chips in a scroller, then
          New. It renders nothing when a press has nowhere to land, so the bar can still be here
          for the counts and Deselect alone. */}
      <TemplateStrip
        projectId={projectId}
        cells={cells}
        askedFamilies={askedFamilies}
        targets={templateTargets}
        targetFamilies={targetFamilies}
        targetEmitters={targetEmitters}
      />
      {/* `ml-auto`, not a `flex-1` spacer. The strip's chip scroller is itself `flex-1`, and two
          `flex: 1 1 0%` siblings *split* the row's free space rather than one of them taking it
          all — so a spacer here silently stole roughly half the scroller's width and opened a
          blank gap before these buttons. An auto margin is resolved after flex growth, so it
          takes the whole slack when the strip is absent and exactly nothing when it is there. */}
      {selection && <div className="ml-auto flex shrink-0 items-center">{selection}</div>}
    </div>
  )
}

/**
 * The key that matches what the grid is actually drawing.
 *
 * Layer scope switches the ownership rings off — the engine has no opinion about a Look's stored
 * rows — so leaving the six-colour key underneath would document colours that are not on screen.
 */
function ScopedLegend({
  fixtureCount,
  selectedCount,
}: {
  fixtureCount: number
  selectedCount: number
}) {
  const scope = useProgrammerScope()
  const Legend = scope?.kind === 'layer' ? LayerLegend : OwnershipLegend
  return <Legend fixtureCount={fixtureCount} selectedCount={selectedCount} />
}

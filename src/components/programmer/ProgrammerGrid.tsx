import { useMemo, type ReactNode } from 'react'
import { KeyRound, Layers, MousePointerSquareDashed, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  LayerKey,
  LayerLegend,
  OwnershipKey,
  OwnershipLegend,
} from '@/components/fixtures-list/OwnershipLegend'
import { Badge } from '@/components/ui/badge'
import {
  describeCellScope,
  type CellRef,
} from '@/components/fixtures-list/cellSelectionModel'
import { cn } from '@/lib/utils'
import { formatFamilyList, type AttributeFamily } from '@/lib/attributeFamily'
import { cellFamilies, COLUMN_DEFS, type ColumnKey } from '@/components/fixtures-list/columns'
import type { ColumnVisibility } from '@/components/fixtures-list/ColumnsMenu'
import { FixturesListContainer } from '@/components/fixtures-list/FixturesListContainer'
import { EditorContextProvider } from '@/components/programmer/EditorContext'
import { LayerRowNotices } from './LayerRowNotices'
import { ProgrammerScopeBand } from './ProgrammerScopeBand'
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
 *
 * **Row B has a phone arm and a folded arm, and they are different questions.** Below `@[600px]`
 * of *this column* the filter becomes a search icon over a popover and a key button appears,
 * because the 22px ownership footer is not rendered at that width (space plan D8). The folded arm
 * is about *height*: under `@media (max-height: 500px)` `ProgrammerBody` stops drawing row A and
 * hands its two halves here as `leading`, so the page's two rows of chrome are one 36px line —
 * which on an 852×393 landscape phone is the difference between three fixture rows and eight.
 * Height is the one thing a container query cannot ask, so that arm is a `useMediaQuery` above
 * the barrier; the grid element itself never moves, so the grid never remounts.
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
  leading,
}: {
  projectId: number
  grouped: boolean
  onGroupedChange: (next: boolean) => void
  columnVisibility: ColumnVisibility
  onColumnVisibilityChange: (next: ColumnVisibility) => void
  /**
   * Row A's two halves, when the page is too short to give them a row of their own — the
   * short-height arm of space plan D8. `null` at every ordinary height, where `ProgrammerBody`
   * draws them above the workspace as it always has. They arrive as an *element* rather than as
   * a flag because they are the page's components, created above the memo barrier: this grid
   * mounts them, it does not know what they are.
   */
  leading?: ReactNode
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
        leading={leading}
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
  leading,
}: {
  projectId: number
  grouped: boolean
  onGroupedChange: (next: boolean) => void
  columnVisibility: ColumnVisibility
  onColumnVisibilityChange: (next: ColumnVisibility) => void
  leading?: ReactNode
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
        compactControls={!!leading}
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
                {/* The short-height arm: row A has no row of its own and its two halves lead this
                    one (space plan D8), and they get an `@container` of their own — because the
                    question their thresholds ask ("has this box room for the word `Editing`?") is
                    about the ~380px the flex gives them here, not about the 750px grid column. It
                    is measured, so it cannot be wrong about a rig whose verbs are wider than the
                    artboard's.

                    Everything after this separator goes to its icon arm while the row is folded —
                    the scope pills through `compact`, `Lit` and `Columns` through
                    `compactControls`, the filter as its search icon — which is what
                    `PhoneLandscape` draws. It is not decoration: the tools' three words are 130px,
                    and the leading block is what pays for them. Without it the source box, a
                    `flex-1` sharing its block with a 230px action bar, rendered four pixels wide
                    on an 852×393 phone. */}
                {leading && (
                  <>
                    <div className="@container flex min-w-0 flex-1 items-center gap-2">
                      {leading}
                    </div>
                    <span className="h-[22px] w-px shrink-0 self-center bg-border" />
                  </>
                )}
                <ProgrammerScopeBand compact={!!leading} />
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
                {/* Two arms of one control. Above `@[600px]` the field is on the row; below it
                    the field is a search icon that opens the same node in a popover — the icon
                    arm session 4 promised, and the real answer to the `min-w-48` squeeze the note
                    above records. Radix mounts popover content only while it is open, so there is
                    one filter input in the document except during the moment it is being used.

                    The **folded row always takes the icon**, and that is a JS test rather than a
                    third class because it cannot be written as one: the field would have to be
                    shown at `width ≥ 600 AND height > 500`, and a container query and a media
                    query cannot be ANDed in a single Tailwind class — written as two conflicting
                    rules it would come down to whichever Tailwind happened to order last. It also
                    fixes a real squeeze: the field is `flex-1` and so is the leading block, so on
                    an 852×393 phone the two split the row and the source box — `flex-1` inside a
                    block sharing it with a 230px action bar — collapsed to four pixels. */}
                {!leading && (
                  <div className="hidden min-w-0 max-w-[340px] flex-1 items-center gap-2 [&>div]:min-w-0 @[600px]:flex">
                    {filter}
                  </div>
                )}
                <FilterPopover className={cn(!leading && '@[600px]:hidden')}>{filter}</FilterPopover>
                {lit}
                {/* Dropped in the folded arm: the leading block is already `flex-1` there, and two
                    competing `flex-1` siblings is the bug session 2 found on this very row. */}
                <span className={cn('flex-1', leading && 'hidden')} />
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
                {/* The key, exactly where the 22px footer that normally carries it is not drawn
                    (see `renderFooter`) — narrow, or short. A grid whose tints are *navigational*
                    has to keep them learnable somewhere, so the two conditions are written as
                    two "show" rules over a hidden base rather than as a hide and an un-hide:
                    both set the same `display`, so neither can lose to the other's ordering. */}
                <ScopedKeyPopover className="hidden @max-[600px]:inline-flex [@media(max-height:500px)]:inline-flex" />
                {/* `Make layer` was this row's right end until session 3 of the space plan moved
                    it onto the rail's Local values row — the row it promotes. See `LocalValuesRow`
                    in `ProgrammerRail` for the one rule that changed with the move. */}
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
          /* The wrapper's `@container` exists only so the legend can be hidden *by its own
             column's* width: `LegendFooter` declares a container itself, and a container query
             never matches the element that declares one. Below 600 the key is on row B behind a
             button instead, and the 22px this footer costs is a row and a half of fixtures on a
             393px phone. The counts go with it — they are the least of what a phone needs.

             The height clause is the short-height arm, and it is the same 22px for the same
             reason: a landscape phone is 393px tall and this is the one band on it that is a
             *key* rather than the show. `ScopedKeyPopover` carries the same pair of conditions
             the other way round, so the button arrives wherever this footer goes — the key
             moves, it is never simply absent. */
          <div className="@container">
            <ScopedLegend
              className="@max-[600px]:hidden [@media(max-height:500px)]:hidden"
              fixtureCount={fixtureCount}
              selectedCount={selectedCount}
            />
          </div>
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
/**
 * Which of the two keys the grid's scope wants — the footer legend and the phone's key popover
 * are two renderings of one question, and this is where it is answered.
 *
 * They had the branch each. A third scope kind would have had to be added to both, and a version
 * that reached only one of them would put a footer and a popover on the same page disagreeing
 * about what the cells mean.
 */
function useLayerScopeKey(): boolean {
  return useProgrammerScope()?.kind === 'layer'
}

function ScopedLegend({
  className,
  fixtureCount,
  selectedCount,
}: {
  className?: string
  fixtureCount: number
  selectedCount: number
}) {
  const Legend = useLayerScopeKey() ? LayerLegend : OwnershipLegend
  return (
    <Legend className={className} fixtureCount={fixtureCount} selectedCount={selectedCount} />
  )
}

/**
 * The filter as a search icon, for the phone's arm of row B.
 *
 * It holds the container's *own* filter node rather than a second input, so there is one piece of
 * state and one placeholder however this is drawn — the field the popover opens is the field the
 * row shows a hundred pixels wider. `w-72` because the node carries `min-w-48` and a popover is
 * the one place that floor is simply right.
 */
function FilterPopover({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-7 shrink-0', className)}
          aria-label="Filter fixtures"
          title="Filter fixtures by name, manufacturer, or type"
        >
          <Search className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        {children}
      </PopoverContent>
    </Popover>
  )
}

/**
 * The ownership key behind a button — the phone's answer to the footer legend, and the same
 * scope swap `ScopedLegend` makes.
 *
 * Stacked rather than the footer's one line: a popover has room for the long glosses, which is
 * the form the footer only reaches at `@[1100px]`. The swatches are the footer's own components,
 * so both are still styled by the real `ownershipCellClass` / `layerCellClass`.
 */
function ScopedKeyPopover({ className }: { className?: string }) {
  const layerScope = useLayerScopeKey()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-7 shrink-0', className)}
          aria-label="Key to the cell colours"
          title="Key to the cell colours"
        >
          <KeyRound className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-3">
        {layerScope ? <LayerKey /> : <OwnershipKey />}
      </PopoverContent>
    </Popover>
  )
}

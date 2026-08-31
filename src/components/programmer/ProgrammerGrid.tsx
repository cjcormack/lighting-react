import { MousePointerSquareDashed } from 'lucide-react'
import { LayerLegend, OwnershipLegend } from '@/components/fixtures-list/OwnershipLegend'
import { describeCellScope } from '@/components/fixtures-list/cellSelectionModel'
import { COLUMN_DEFS, type ColumnKey } from '@/components/fixtures-list/columns'
import type { ColumnVisibility } from '@/components/fixtures-list/ColumnsMenu'
import { FixturesListContainer } from '@/components/fixtures-list/FixturesListContainer'
import { EditorContextProvider } from '@/components/programmer/EditorContext'
import { LayerRowNotices } from './LayerRowNotices'
import { TemplateStrip } from './TemplateStrip'
import { useLookRowStore } from './LookRowStore'
import { useProgrammerScope } from './ProgrammerScope'
import type { EditorContextValue } from '@/components/programmer/EditorContext'

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
 * The column menu is *not* here: it renders in the action bar's Sheet zone, a full-width band above
 * the workspace, so the page owns that state and passes it down.
 */
/** Column labels for the scope description, from the same table the header renders. */
const COLUMN_LABELS = new Map(COLUMN_DEFS.map((d) => [d.key, d.label]))
const columnLabel = (col: ColumnKey) => COLUMN_LABELS.get(col) ?? col

export function ProgrammerGrid({
  projectId,
  grouped,
  columnVisibility,
  onColumnVisibilityChange,
}: {
  projectId: number
  grouped: boolean
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
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={onColumnVisibilityChange}
      />
    </EditorContextProvider>
  )
}

function ProgrammerGridBody({
  projectId,
  grouped,
  columnVisibility,
  onColumnVisibilityChange,
}: {
  projectId: number
  grouped: boolean
  columnVisibility: ColumnVisibility
  onColumnVisibilityChange: (next: ColumnVisibility) => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
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
        renderToolbar={({ filter, lit, selection, cells }) => (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {filter}
              {lit}
            </div>
            <LayerRowNotices projectId={projectId} />
            {/* The template strip, above the grid and below the filter. It reads the *cell*
                selection — which `renderToolbar` already hands down, so the strip needs no new
                plumbing into the table's own state — and the selection is what filters it. */}
            <TemplateStrip projectId={projectId} cells={cells} />
            {/* Two selections, both live at once, so both are named. FIXTURE selection is what
                Record scopes on; CELL selection is a transient edit scope that only says where the
                next value goes. Leaving either to be inferred from the buttons beside it is how an
                operator ends up recording a different set from the one they meant. */}
            {(selection || cells.length > 0) && (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-primary/[0.09] px-2 py-1.5">
                <MousePointerSquareDashed className="size-3.5 shrink-0 text-primary" />
                {selection && <span className="text-xs font-medium">Selected fixtures</span>}
                {cells.length > 0 && (
                  <>
                    {selection && <span className="text-muted-foreground/40">·</span>}
                    <span className="text-xs font-medium text-primary">
                      {cells.length} cell{cells.length === 1 ? '' : 's'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {describeCellScope(cells, columnLabel)} — edit once, applies to all
                    </span>
                  </>
                )}
                <span className="flex-1" />
                {selection}
              </div>
            )}
          </div>
        )}
      />
      <ScopedLegend />
    </div>
  )
}

/**
 * The key that matches what the grid is actually drawing.
 *
 * Layer scope switches the ownership rings off — the engine has no opinion about a Look's stored
 * rows — so leaving the six-colour key underneath would document colours that are not on screen.
 */
function ScopedLegend() {
  const scope = useProgrammerScope()
  return scope?.kind === 'layer' ? <LayerLegend /> : <OwnershipLegend />
}

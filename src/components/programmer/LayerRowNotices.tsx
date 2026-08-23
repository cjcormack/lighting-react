import { Badge } from '@/components/ui/badge'
import { useLookRowStore } from './LookRowStore'
import { useProgrammerScope } from './ProgrammerScope'

/**
 * What the focused layer holds that a per-fixture grid cannot draw.
 *
 * Two kinds of row, and both are stated rather than silently missing — a Look that looks empty
 * because the grid can't render it is the worst of the available answers.
 *
 * **Deferred rows** name no target of their own: they land on whatever the applying layer targets,
 * so they belong to no one fixture's row. Projecting them onto every targeted row was considered
 * and rejected: the first edit would silently convert a deferred row into a bound one, which is a
 * change to what the Look *is*, made by someone who was only adjusting a value. They are listed
 * read-only instead, and edited where they make sense — the Look editor.
 *
 * **Element rows** address one element of a multi-element fixture, and compose nowhere:
 * `CueComposer.applyLayer` drops them, so they contribute nothing to a cue that layers this Look
 * (`FU-LOOK-ELEMENT-ROWS`). The client cannot even author one — `LookRow.elementKey` is an
 * element-*local* suffix and `syntheticFixture.ts` records that element keys must never be parsed.
 * Saying so is the honest position until that follow-up lands.
 */
export function LayerRowNotices() {
  const scope = useProgrammerScope()
  const store = useLookRowStore()
  if (scope?.kind !== 'layer' || !store) return null

  const { deferredRows, elementRows, serverRows, loaded } = store
  const boundRowCount = serverRows.size
  const fullyDeferred = loaded && boundRowCount === 0 && deferredRows.length > 0

  if (deferredRows.length === 0 && elementRows.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs">
      {deferredRows.length > 0 && (
        <>
          <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
            {deferredRows.length} deferred
          </Badge>
          <span className="text-muted-foreground">
            {fullyDeferred
              ? 'Every row in this look takes its target from the layer, so there is nothing to show per fixture. Edit it in the look editor.'
              : 'Rows that take their target from the layer. They apply, but belong to no one head — edit them in the look editor.'}
          </span>
        </>
      )}
      {elementRows.length > 0 && (
        <>
          <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
            {elementRows.length} per-element
          </Badge>
          <span className="text-muted-foreground">
            Rows addressing a single element. They are stored, but nothing composes them yet.
          </span>
        </>
      )}
    </div>
  )
}

import { useMemo } from 'react'
import { formatFamilyList, type AttributeFamily } from '@/lib/attributeFamily'
import { describeCellScope, type CellRef } from '@/components/sheet/cellSelectionModel'
import { cellFamilies, columnLabel, type ColumnKey } from '@/components/fixtures-list/columns'
import { SelectionBar as SheetSelectionBar } from '@/components/sheet/SelectionBar'
import { TemplateStrip } from './TemplateStrip'
import type { LocateTarget } from '@/store/locate'

/**
 * Row C on the programmer — the sheet kit's selection bar with the templates riding it.
 *
 * The bar itself — the 40px line, the counts, the family pill, the hints, the hold-its-place
 * rule on a short viewport — is `sheet/SelectionBar.tsx` since the patch list, the DMX sheet and
 * the cue sheet gained the same row (CLAUDE.md §Sheet kit). What is the programmer's is what this
 * file computes: the family the marquee *named* (never the capability list a rows-only selection
 * produces — badging that would read as the operator's statement when it is only the strip's
 * filter), the heads a template press lands on, and the strip itself.
 *
 * `askedFamilies` is derived once and shared with the strip, so the badge and the chips beside it
 * cannot disagree about what is being offered — and so a marquee drag, which mints a fresh `cells`
 * array on every animation frame, pays for one pass rather than two.
 */
export function SelectionBar({
  projectId,
  selection,
  cells,
  cellEntryKey,
  cellClearKey,
  templateTargets,
  targetFamilies,
  targetEmitters,
  marqueeDragging,
}: {
  projectId: number
  selection: React.ReactNode | null
  cells: readonly CellRef<ColumnKey>[]
  cellEntryKey: boolean
  cellClearKey: boolean
  templateTargets: readonly LocateTarget[]
  targetFamilies: readonly AttributeFamily[]
  targetEmitters: readonly string[]
  marqueeDragging: boolean
}) {
  const askedFamilies = useMemo(() => (cells.length > 0 ? cellFamilies(cells) : null), [cells])

  // The fixture count is `templateTargets` — the heads a press actually lands on, which is the
  // cells' heads under a marquee and the selected rows' otherwise — and deliberately not the
  // footer's `selectedCount`, which counts visible *rows* with a group as one. Two numbers, two
  // questions: the footer says how much of the list you have picked, this says how many heads
  // your next gesture reaches.
  const fixtures = `${templateTargets.length} fixture${templateTargets.length === 1 ? '' : 's'}`

  return (
    <SheetSelectionBar
      rowLabel={templateTargets.length > 0 ? fixtures : null}
      cellLabel={cells.length > 0 ? `${cells.length} cell${cells.length === 1 ? '' : 's'}` : null}
      // Session 1's rule: the sentence becomes the hover. `describeCellScope` is the same string
      // the drag chip shows, so the two agree by construction. The fixture count rides it too,
      // since on a phone the hover is the only place that count is said.
      cellTitle={`${fixtures} · ${describeCellScope(cells, columnLabel)} — edit once, applies to all`}
      family={askedFamilies != null ? formatFamilyList(askedFamilies, ' · ') : null}
      hints={{ entry: cellEntryKey, clear: cellClearKey }}
      // The templates, on this line since session 2: a hairline, the chips in a scroller, then
      // New. It renders nothing when a press has nowhere to land, so the bar can still be here
      // for the counts and Deselect alone.
      strip={
        <TemplateStrip
          projectId={projectId}
          cells={cells}
          askedFamilies={askedFamilies}
          targets={templateTargets}
          targetFamilies={targetFamilies}
          targetEmitters={targetEmitters}
        />
      }
      verbs={selection}
      marqueeDragging={marqueeDragging}
    />
  )
}

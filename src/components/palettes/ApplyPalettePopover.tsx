import { useState } from 'react'
import { useParams } from 'react-router'
import { Link2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { lightingApi } from '@/api/lightingApi'
import { formatError } from '@/lib/formatError'
import { PALETTE_TYPES, PALETTE_TYPE_LABELS } from '@/lib/paletteTypes'
import { useLazyPaletteQuery, usePaletteListQuery } from '@/store/palettes'
import { paletteCoverageWarnings, planPaletteRefWrites } from './applyPalette'
import { PalettePreviewRow } from './paletteValue'
import type { PaletteSummary } from '@/api/palettesApi'
import type { WriteTarget } from '@/components/fixtures-list/rowModel'

interface ApplyPalettePopoverProps {
  /** The expanded selection, in visible row order. */
  targets: readonly WriteTarget[]
}

/**
 * Apply a named palette to the current selection.
 *
 * Sits in the selection toolbar beside Fan, Locate and Highlight because the gesture is
 * definitionally selection-scoped — "these heads take Warm Amber" — and that toolbar is the one
 * place the selection is in hand. It appears on the plain Fixtures and Groups lists too, which is
 * correct: `EditorContext { kind: 'live' }` there also means "write the programmer".
 *
 * What it writes is a **reference**, not the palette's values: `ref:{uuid}` per covered property,
 * which the backend resolves per fixture. That is the whole point — a later edit to the palette
 * moves these heads too. Uncovered fixtures are skipped by the backend and named in a warning
 * here; silence would read as success.
 */
export function ApplyPalettePopover({ targets }: ApplyPalettePopoverProps) {
  const { projectId } = useParams()
  const projectIdNum = Number(projectId)
  const [isOpen, setIsOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const { data: palettes } = usePaletteListQuery({ projectId: projectIdNum }, { skip: !isOpen })
  const [fetchPalette, { isFetching }] = useLazyPaletteQuery()

  const needle = filter.trim().toLowerCase()
  const groups = PALETTE_TYPES.map((type) => ({
    type,
    palettes: (palettes ?? []).filter(
      (palette) => palette.type === type && (needle === '' || palette.name.toLowerCase().includes(needle)),
    ),
  })).filter((group) => group.palettes.length > 0)

  const apply = async (summary: PaletteSummary) => {
    // The detail read is what makes the coverage report honest: the summary carries counts, not
    // the target keys, and applying without knowing them would leave us unable to say which
    // heads got nothing.
    let detail
    try {
      detail = await fetchPalette({ projectId: projectIdNum, paletteId: summary.id }).unwrap()
    } catch (err) {
      // Queries are outside `errorToastMiddleware`, so without this a palette deleted from
      // another tab a moment ago makes Apply do nothing at all, with no message — the exact
      // silence this component's coverage warnings exist to avoid.
      toast.error(formatError(err))
      return
    }
    const writes = planPaletteRefWrites(detail, targets)
    for (const write of writes) {
      lightingApi.programmer.set('fixture', write.targetKey, write.propertyName, write.value)
    }
    setIsOpen(false)
    for (const warning of paletteCoverageWarnings(detail, targets, writes)) toast.warning(warning)
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" title="Apply a palette to the selection">
          <Link2 className="size-3.5" />
          <span className="hidden sm:inline">Palette</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2" align="start">
        <p className="text-xs text-muted-foreground">
          Applying to {targets.length} target{targets.length === 1 ? '' : 's'}. The programmer keeps
          a reference, so a later palette edit moves them too.
        </p>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter palettes"
          aria-label="Filter palettes"
          className="h-8"
        />
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {groups.map(({ type, palettes: group }) => (
            <div key={type} className="space-y-0.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {PALETTE_TYPE_LABELS[type].plural}
              </p>
              {group.map((palette) => (
                <button
                  key={palette.id}
                  type="button"
                  disabled={isFetching}
                  onClick={() => void apply(palette)}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-accent disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1 truncate">{palette.name}</span>
                  <PalettePreviewRow
                    type={palette.type}
                    preview={palette.preview.slice(0, 4)}
                    className="shrink-0"
                  />
                </button>
              ))}
            </div>
          ))}
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {palettes == null ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                'No palettes yet. Record one from the programmer.'
              )}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

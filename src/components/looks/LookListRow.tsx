import type { MouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Clapperboard, Copy, CopyPlus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FAMILY_LABELS } from '@/lib/attributeFamily'
import type { LookSummary } from '@/api/looksApi'
import { LookPreviewSwatches } from './lookRefValue'

interface LookListRowProps {
  look: LookSummary
  selected?: boolean
  /** Resolved label for `editorFixtureType`, when there is one. */
  fixtureTypeLabel?: string | null
  onClick?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onCopy?: () => void
  onDuplicate?: () => void
}

/**
 * One row of the Look library.
 *
 * Renders **from the summary alone** — families, counts, usage and the value preview all arrive
 * with the list, so scrolling the library never fetches a Look. That is also why there is no
 * expandable effects list here as the preset row had: `effectCount` comes with the summary, the
 * effects themselves do not.
 */
export function LookListRow({
  look,
  selected,
  fixtureTypeLabel,
  onClick,
  onEdit,
  onDelete,
  onCopy,
  onDuplicate,
}: LookListRowProps) {
  return (
    <div className={cn(selected && 'bg-accent')}>
      <div
        className={cn(
          'group flex items-center gap-2 rounded-md px-3 py-2.5 min-h-[44px] hover:bg-accent/50 transition-colors',
          onClick && 'cursor-pointer',
        )}
        onClick={onClick}
      >
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate">{look.name}</div>
          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
            {look.notes ?? describeContents(look, fixtureTypeLabel)}
          </div>
        </div>

        <LookPreviewSwatches preview={look.preview} />

        {/* Families, derived server-side. Several is normal and is the point of there being no
            type column, so they all render rather than collapsing to a primary one. */}
        <div className="flex items-center gap-1 shrink-0">
          {look.families.map((family) => (
            <Badge key={family} variant="outline" className="text-[10px] px-1.5 py-0">
              {FAMILY_LABELS[family].singular}
            </Badge>
          ))}
        </div>

        {look.effectCount > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
            {look.effectCount} fx
          </Badge>
        )}

        {look.layerCount > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 shrink-0 gap-1"
            title={describeUsage(look)}
          >
            <Clapperboard className="size-3" />
            {look.layerCount}
          </Badge>
        )}

        {(onEdit || onDelete || onCopy || onDuplicate) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={menuAction(onEdit)}>
                  <Pencil className="size-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              )}
              {onDuplicate && (
                <DropdownMenuItem onClick={menuAction(onDuplicate)}>
                  <CopyPlus className="size-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
              )}
              {onCopy && (
                <DropdownMenuItem onClick={menuAction(onCopy)}>
                  <Copy className="size-4 mr-2" />
                  Copy to Project
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem onClick={menuAction(onDelete)} className="text-destructive">
                  <Trash2 className="size-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

/**
 * Run a row-menu action without also running the row's own `onClick`.
 *
 * The menu content is portalled, but React events still bubble through the *component* tree, so a
 * bare handler here would fire the row click too — pressing Delete would open the confirmation and
 * the editor behind it.
 */
function menuAction(fn: () => void) {
  return (e: MouseEvent) => {
    e.stopPropagation()
    fn()
  }
}

/** The fallback subtitle when a Look has no notes: what it covers, in one line. */
function describeContents(look: LookSummary, fixtureTypeLabel?: string | null): string {
  const rows = `${look.rowCount} ${look.rowCount === 1 ? 'row' : 'rows'}`
  if (look.hasDeferredRows) {
    const where = fixtureTypeLabel ?? look.editorFixtureType
    return where ? `${rows} · authored against ${where}` : `${rows} · no editor fixture type`
  }
  if (look.targetCount === 0) return 'Empty'
  return `${look.targetCount} ${look.targetCount === 1 ? 'fixture' : 'fixtures'} · ${rows}`
}

/**
 * Layers used to be counted here alongside `ref:` rows — two different reference mechanisms, named
 * apart in the tooltip even though the badge summed them. Only layers remain.
 */
function describeUsage(look: LookSummary): string {
  return `Used by ${look.layerCount} cue ${look.layerCount === 1 ? 'layer' : 'layers'}`
}

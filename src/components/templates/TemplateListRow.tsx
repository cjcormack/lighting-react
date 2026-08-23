import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FAMILY_LABELS } from '@/lib/attributeFamily'
import { describeTemplateIntent, templateIntentSwatch } from '@/lib/templateIntent'
import type { TemplateSummary } from '@/api/templatesApi'
import type { MouseEvent } from 'react'

/**
 * One row of the template library.
 *
 * Renders **from the summary alone** — a template's rows come with the list, so the row shows the
 * real value rather than a placeholder and scrolling the library fetches nothing. That is affordable
 * here in a way it is not for a Look: a template is one row, or one per head for a focus position.
 *
 * The row states **generic vs per fixture** in words. It is the existing deferred/bound row split
 * kept as an internal detail rather than promoted to two library sections — but an operator still
 * needs to know which they have, because applying a per-fixture template to a head it holds no entry
 * for asserts nothing for that head.
 */
export function TemplateListRow({
  template,
  onClick,
  onDelete,
}: {
  template: TemplateSummary
  onClick?: () => void
  onDelete?: () => void
}) {
  const stop = (e: MouseEvent) => e.stopPropagation()

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-3 py-2.5 min-h-[44px] hover:bg-accent/50 transition-colors',
        onClick && 'cursor-pointer',
      )}
      onClick={onClick}
    >
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm truncate">{template.name}</div>
        <div className="text-[11px] text-muted-foreground truncate mt-0.5">
          {template.notes ?? describeShape(template)}
        </div>
      </div>

      <TemplateValuePreview template={template} />

      {template.family != null && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
          {FAMILY_LABELS[template.family].singular}
        </Badge>
      )}

      {template.layerCount > 0 && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
          {template.layerCount} layer{template.layerCount === 1 ? '' : 's'}
        </Badge>
      )}

      {(onClick || onDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={stop}>
            <Button variant="ghost" size="icon" className="size-7 shrink-0">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={stop}>
            {onClick && (
              <DropdownMenuItem onClick={onClick}>
                <Pencil className="size-3.5" />
                Edit
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="size-3.5" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

/**
 * The value, in the grid's own language: a swatch for a colour, the number for anything else.
 *
 * A per-fixture template shows the *first* row's value and how many there are, because the point of
 * one is that the values differ — showing all eight pan/tilt pairs in a library row would be noise,
 * and showing one without saying there are more would be a lie.
 */
function TemplateValuePreview({ template }: { template: TemplateSummary }) {
  const first = template.rows[0]
  if (first == null) return null
  const swatch = templateIntentSwatch(first.value)

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {swatch != null ? (
        <span
          className="size-4 rounded-sm border border-border/60"
          style={{ background: swatch }}
          title={describeTemplateIntent(first.value)}
        />
      ) : (
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {describeTemplateIntent(first.value)}
        </span>
      )}
      {template.rows.length > 1 && (
        <span className="text-[10px] text-muted-foreground">+{template.rows.length - 1}</span>
      )}
    </div>
  )
}

function describeShape(template: TemplateSummary): string {
  if (template.isGeneric) {
    const family = template.family
    switch (family) {
      case 'COLOUR':
        return 'Generic · any fixture with colour'
      case 'INTENSITY':
        return 'Generic · any fixture with a dimmer'
      case 'POSITION':
        return 'Generic · any moving head'
      case 'BEAM':
        return 'Generic · any fixture with the beam role'
      default:
        return 'Generic · any fixture'
    }
  }
  const heads = new Set(template.rows.map((r) => r.targetKey)).size
  return `Per fixture · ${heads} head${heads === 1 ? '' : 's'}`
}

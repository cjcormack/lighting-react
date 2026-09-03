import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type Ref } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FolderOpen, MoreHorizontal, Pencil, Ungroup } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FAMILY_LABELS, type AttributeFamily } from '@/lib/attributeFamily'
import type { TemplateGroup } from '@/api/templatesApi'

/**
 * A template group in the library list: a header row, and the members indented beneath it.
 *
 * Presentational — the DnD wiring (`useSortable` on the header, `useDroppable` on the body) lives
 * in `TemplateLayoutList`, which hands in the two refs and the drag handle, so this component
 * renders and tests without a `DndContext`. What it knows about a group is what the row says: the
 * name, the family its members derive (or *empty*), how many there are, and that pressing one on
 * the busk view releases the others — stated once, in the header's tooltip, because it is the fact
 * that makes a group different from a heading.
 *
 * Rename is inline: a group's only content is its name, and a sheet for one field is a sheet too
 * many. *Ungroup* rather than *Delete*, because that is what the server does — the members go back
 * to the top level in the group's place, and nothing is lost but the cluster.
 */
export function TemplateGroupRow({
  group,
  family,
  memberCount,
  dragHandle,
  editable,
  onRename,
  onDelete,
  refused = false,
  isOver = false,
  headerRef,
  bodyRef,
  children,
}: {
  group: TemplateGroup
  /** Derived from the members *as laid out*, so a draft mid-drag answers for what it would hold. */
  family: AttributeFamily | null
  memberCount: number
  dragHandle?: ReactNode
  editable: boolean
  onRename?: (name: string) => void
  onDelete?: () => void
  /** A drag hovering here would put two families in the group — drawn as a refusal, not a target. */
  refused?: boolean
  /** A drag hovering here would join the group. */
  isOver?: boolean
  headerRef?: Ref<HTMLDivElement>
  bodyRef?: Ref<HTMLDivElement>
  children?: ReactNode
}) {
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(group.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const stop = (e: MouseEvent) => e.stopPropagation()

  // `focus()` **then** `select()`: the rename starts from a dropdown item, so nothing has focus on
  // the input yet and `select()` alone selects text in a field the operator still has to click
  // before typing reaches it (and `onBlur` could never fire, so Escape was the only way out).
  useEffect(() => {
    if (!renaming) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [renaming])

  const startRename = () => {
    setDraftName(group.name)
    setRenaming(true)
  }
  const commitRename = () => {
    setRenaming(false)
    const next = draftName.trim()
    if (next !== '' && next !== group.name) onRename?.(next)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRename()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setRenaming(false)
    }
  }

  return (
    <div data-template-group={group.name} className="bg-muted/10">
      <div
        ref={headerRef}
        className="flex items-center gap-2 px-3 py-2 min-h-[40px]"
        title="A group: pressing one of its pads on the busk view releases the others on the same targets"
      >
        {dragHandle}
        <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
        {renaming ? (
          <Input
            ref={inputRef}
            aria-label="Group name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commitRename}
            className="h-7 text-sm"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{group.name}</span>
        )}
        {!renaming && (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {memberCount === 0 ? 'empty' : `${memberCount} template${memberCount === 1 ? '' : 's'}`}
          </span>
        )}
        {family != null && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
            {FAMILY_LABELS[family].singular}
          </Badge>
        )}
        {editable && !renaming && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={stop}>
              <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`${group.name} menu`}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={stop}>
              <DropdownMenuItem onClick={startRename}>
                <Pencil className="size-3.5" />
                Rename
              </DropdownMenuItem>
              {onDelete && (
                <DropdownMenuItem onClick={onDelete}>
                  <Ungroup className="size-3.5" />
                  Ungroup
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div
        ref={bodyRef}
        className={cn(
          'ml-6 border-l divide-y transition-colors',
          isOver && !refused && 'bg-primary/5 ring-1 ring-inset ring-primary/40',
          refused && 'bg-destructive/5 ring-1 ring-inset ring-destructive/60',
        )}
        title={refused ? 'A group holds one family' : undefined}
      >
        {children}
        {memberCount === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            {editable ? 'Drop templates here, or pick this group in a template’s editor.' : 'No templates.'}
          </div>
        )}
      </div>
    </div>
  )
}

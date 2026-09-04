import { useEffect, useState } from 'react'
import { useDndMonitor, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import { useSelector } from 'react-redux'
import { MoreHorizontal, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { selectSaveStatus } from '@/store/saveStatusSlice'
import type { BuskPage } from '@/api/buskApi'
import { buskPageTabId, parseBuskDragId } from '@/lib/buskLayout'

/**
 * The page tabs, and the one control that turns the page editable.
 *
 * **A project with no pages gets no create button here.** `BuskFirstOpen` owns that moment, and it
 * offers the two starting points the plan settled on; a bare *+ Page* beside it would be a second
 * affordance for the same thing that skipped the starter layout entirely.
 *
 * *Saved* is read off the show-wide save counters rather than any state of its own: a layout write
 * is an ordinary save, so it already reports there (see `NON_SAVE_ENDPOINTS`, which the *press*
 * joins and the layout write deliberately does not).
 */

function PageTab({
  page,
  index,
  active,
  editing,
  onSelect,
}: {
  page: BuskPage
  index: number
  active: boolean
  editing: boolean
  onSelect: () => void
}) {
  const id = buskPageTabId(index)
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id,
    data: { type: 'busk-page-tab', index, pageId: page.id, name: page.name },
    disabled: !editing,
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id, disabled: !editing })

  return (
    <button
      ref={(node) => {
        setDragRef(node)
        setDropRef(node)
      }}
      type="button"
      {...(editing ? attributes : {})}
      {...(editing ? listeners : {})}
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-colors',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
        editing && 'cursor-grab touch-none',
        isDragging && 'opacity-40',
        isOver && !isDragging && 'ring-1 ring-primary',
      )}
    >
      {page.name}
    </button>
  )
}

export interface BuskPageStripProps {
  pages: BuskPage[]
  activePageId: number | null
  editing: boolean
  onSelect: (pageId: number) => void
  onCreate: (name: string) => Promise<unknown>
  onRename: (name: string) => Promise<unknown>
  onDelete: () => void
  /** Every page id, in the order wanted — the reorder route takes nothing less. */
  onReorder: (pageIds: number[]) => void
  onToggleEditing: () => void
}

export function BuskPageStrip({
  pages,
  activePageId,
  editing,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onReorder,
  onToggleEditing,
}: BuskPageStripProps) {
  const { pending, savedTick } = useSelector(selectSaveStatus)
  const [naming, setNaming] = useState<'create' | 'rename' | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const active = pages.find((page) => page.id === activePageId) ?? null

  useEffect(() => {
    if (savedTick === 0) return
    setJustSaved(true)
    const timer = window.setTimeout(() => setJustSaved(false), 1800)
    return () => window.clearTimeout(timer)
  }, [savedTick])

  useEffect(() => {
    if (!editing) setNaming(null)
  }, [editing])

  // A second monitor on the same shared context. Page order is its own route rather than part of
  // the layout document, so it is handled here rather than in `BuskEditProvider`'s drop reducer.
  useDndMonitor({
    onDragEnd(event: DragEndEvent) {
      const data = event.active.data.current
      if (data?.type !== 'busk-page-tab' || event.over == null) return
      const over = parseBuskDragId(String(event.over.id))
      if (over?.kind !== 'page-tab') return
      const from = data.index as number
      if (from === over.index) return
      const ids = pages.map((page) => page.id)
      const [moved] = ids.splice(from, 1)
      ids.splice(over.index, 0, moved)
      onReorder(ids)
    },
  })

  async function submitName() {
    const name = draft.trim()
    if (name.length === 0) return
    try {
      if (naming === 'create') await onCreate(name)
      else await onRename(name)
      setNaming(null)
      setError(null)
    } catch (err) {
      const code = (err as { data?: { code?: string; error?: string } })?.data
      setError(
        code?.code === 'BUSK_PAGE_NAME_TAKEN'
          ? 'A page of that name already exists'
          : (code?.error ?? 'Could not save that name'),
      )
    }
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-4 pt-2.5">
      <div className="inline-flex items-center gap-0.5 rounded-[10px] border bg-card p-0.5">
        {pages.map((page, index) => (
          <PageTab
            key={page.id}
            page={page}
            index={index}
            active={page.id === activePageId}
            editing={editing}
            onSelect={() => onSelect(page.id)}
          />
        ))}
        {editing && (
          <button
            type="button"
            onClick={() => {
              setDraft('')
              setError(null)
              setNaming('create')
            }}
            className="rounded-lg border border-dashed px-4 py-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
          >
            + Page
          </button>
        )}
      </div>

      {naming != null && (
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            value={draft}
            aria-label={naming === 'create' ? 'New page name' : 'Page name'}
            placeholder={naming === 'create' ? 'Page name' : active?.name}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitName()
              if (e.key === 'Escape') setNaming(null)
            }}
            className="h-7 w-40 text-[13px]"
          />
          <Button size="sm" className="h-7" onClick={() => void submitName()}>
            {naming === 'create' ? 'Add' : 'Rename'}
          </Button>
          {error && <span className="text-[11px] text-destructive">{error}</span>}
        </div>
      )}

      <div className="flex-1" />

      {editing ? (
        <>
          <span className="text-[11px] text-muted-foreground">
            {pending > 0 ? 'Saving…' : justSaved ? 'Saved' : ''}
          </span>
          {active && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Options for ${active.name}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    setDraft(active.name)
                    setError(null)
                    setNaming('rename')
                  }}
                >
                  Rename page
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setConfirmingDelete(true)}
                >
                  Delete page
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button size="sm" className="h-7 text-xs" onClick={onToggleEditing}>
            Done
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={onToggleEditing}
          disabled={pages.length === 0}
        >
          <Pencil className="size-3.5" /> Edit layout
        </Button>
      )}
      {/* Confirmed, unlike every other edit-mode gesture: the rest move pads about and are undone by
          moving them back, while this takes a whole arrangement away and the layout write has no
          undo. */}
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{active?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its banks and pads go with it. The templates, Looks and cues they pointed at are not
              touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmingDelete(false)
                onDelete()
              }}
            >
              Delete page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}

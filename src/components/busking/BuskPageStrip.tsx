import { useEffect, useState, type ReactNode } from 'react'
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
import { allBanks, buskPageTabId, parseBuskDragId } from '@/lib/buskLayout'
import { BuskLabel } from './BuskLabel'
import { BuskPageChip } from './BuskPageChip'

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
 *
 * **`controls` is the Focus control and its neighbours** (busk-further plan session 4), handed in
 * by `BuskingView` rather than mounted here, because in Rig focus this strip is the *folded* page
 * at the bottom of the body and the control has to be there too, or Rig focus would have no way
 * back — one strip component, placed twice, and the control travels with it.
 *
 * **Folded, it is the board's 40px strip and not the tab strip drawn folded** (`Phones.dc.html`
 * note 8, busk-further plan §11): the page's name, its bank count and the controls, nothing else.
 * Rig focus exists to give the band the height, and the full tab strip wraps on a phone and takes
 * it back. A page is chosen in Split; the fold says which one this window is on and offers the one
 * tap back.
 */

function PageTab({
  page,
  index,
  active,
  editing,
  dense,
  onSelect,
}: {
  page: BuskPage
  index: number
  active: boolean
  editing: boolean
  dense: boolean
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
        'rounded-lg font-semibold transition-colors',
        dense ? 'px-2.5 py-0.5 text-xs' : 'px-4 py-1.5 text-[13px]',
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
  /** The Focus control (and, off the desk board, the sheet button), drawn beside *Edit layout* / *Done*. */
  controls?: ReactNode
  /** Rig focus: the 40px folded page at the bottom of the body — name, bank count, the controls. */
  folded?: boolean
  /**
   * The short board's merged row (`Phones.dc.html`, landscape): a 32px row with the rig strip's
   * pieces in [leading], the page tabs and the controls after them — one row where the desk board
   * has two, because there are 297px under the ShowBar and every row is a row of pads lost.
   */
  dense?: boolean
  /** Drawn before the tabs: the rig strip's pieces on the merged row. */
  leading?: ReactNode
  /**
   * Whether *Edit layout* is offered at all. Off below `md` and on the short board alike: the
   * palette needs both regions on screen, and there is no room for both. `Done` is drawn whatever
   * this says, so a window narrowed mid-edit can still leave the mode.
   */
  editable?: boolean
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
  controls,
  folded = false,
  dense = false,
  leading,
  editable = true,
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

  if (folded) {
    const bankCount = active == null ? 0 : allBanks(active).length
    return (
      <div data-busk-page-strip="folded" className="flex h-10 shrink-0 items-center gap-2.5 border-t px-4">
        <BuskLabel className="shrink-0 whitespace-nowrap">Pages</BuskLabel>
        <span className="min-w-0 truncate text-[13px] font-semibold">{active?.name ?? '—'}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {active == null ? '' : bankCount === 0 ? 'No banks' : `${bankCount} ${bankCount === 1 ? 'bank' : 'banks'}`}
        </span>
        <div className="flex-1" />
        {controls}
      </div>
    )
  }

  return (
    <div
      data-busk-page-strip="open"
      data-busk-page-strip-dense={dense ? 'true' : undefined}
      className={cn(
        'flex shrink-0 items-center px-4',
        // The merged row is exactly 32px and never wraps — a second line would cost the pads the
        // row it was merged to save; the desk rows wrap, the verbs taking a second line at a
        // tablet width.
        dense ? 'h-8 gap-2 border-b' : 'flex-wrap gap-2.5 pt-2.5',
      )}
    >
      {leading}
      <div className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-[10px] border bg-card', dense ? 'p-px' : 'p-0.5')}>
        {pages.map((page, index) => (
          <PageTab
            key={page.id}
            page={page}
            index={index}
            active={page.id === activePageId}
            editing={editing}
            dense={dense}
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

      {/* Beside the tabs, because a control belongs with the thing it changes — and what it changes
          is which of *these* this window is on. Its sibling, the selection's `DeskChip`, is a row
          up in the target band; the pair carries the same pill so they read as one system, and each
          names its own subject so neither reads as governing the whole view.

          Withheld until there are pages, like the create button above it and for a sharper reason:
          with none, a click would unlink this window onto nothing, and — because unlinking *is* a
          decision — it would also spend the one arrival decision `BuskingView` is waiting to make,
          so a window launched at `?page=3` would silently never land on page 3. */}
      {pages.length > 0 && <BuskPageChip activePageId={activePageId} />}

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

      {/* On the merged row the rig's summary is the flexible item and sits in `leading`; a dense
          row with nothing leading it — the short board in Split — still needs one, or the controls
          pack against the tabs. */}
      {(!dense || leading == null) && <div className="flex-1" />}

      {controls}

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
        // The desk board's by decision (`editable`): below `md` the library palette is not shown,
        // and on the short board there is no room for it beside the page — an edit mode with
        // nothing to drag from, or nowhere to drop it, is a trap rather than a feature. `Done`
        // above stays whatever the board, so a window narrowed mid-edit can still leave the mode.
        editable && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onToggleEditing}
            disabled={pages.length === 0}
          >
            <Pencil className="size-3.5" /> Edit layout
          </Button>
        )
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

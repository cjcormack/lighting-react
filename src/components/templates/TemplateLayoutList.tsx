import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import type { TemplateGroup, TemplateLayoutEntryInput, TemplateSummary } from '@/api/templatesApi'
import {
  filterLayoutByFamily,
  groupBodyDragId,
  groupDragId,
  groupFamilyOf,
  layoutEntryId,
  layoutToRequest,
  moveInLayout,
  parseDragId,
  templateDragId,
  type LayoutEntry,
} from '@/lib/templateLayout'
import type { LookFamilyFilter } from '@/components/ViewSwitcher'
import { TemplateListRow } from './TemplateListRow'
import { TemplateGroupRow } from './TemplateGroupRow'

/**
 * The template library as an orderable tree: top-level templates and groups in one list, members
 * inside their group, all draggable.
 *
 * The **reducer is elsewhere** (`lib/templateLayout.ts` — `moveInLayout`), and this component is
 * the dnd-kit wiring around it: a `DndContext`, one `SortableContext` for the top level, one
 * nested per group for its members, and a `useDroppable` body per group so an empty group can take
 * a drop. `onDragOver` asks the reducer in its `'over'` phase (cross-container moves only, so a
 * hover inside a container never fights the sortable preview) and holds the answer as a local
 * draft; `onDragEnd` asks in its `'end'` phase and commits the whole layout once. Between the two,
 * the server is not consulted — the whole point of a draft is that a drag is one write.
 *
 * Why the header and the body are two droppables: over a group's **header** means "put me at this
 * top-level position" and over its **body** means "put me in this group". `useSortable` measures
 * the header only (`setNodeRef` there), while the transform it hands back is applied to the whole
 * group wrapper so header and members move together.
 *
 * **The filter is applied here, and only to what is drawn.** The component takes the *whole*
 * project layout and the family separately, so `moveInLayout` and `layoutToRequest` always see
 * every entry while `shown` is one bank — which is what lets a drag under a family filter post the
 * complete layout the server requires (`moveInLayout`'s docblock has the four properties that make
 * that sound). Drag is therefore available in every bank; `dndEnabled` now says only "this is the
 * current project". The `DndContext` stays mounted when it is false — the repo rule — with every
 * sortable `disabled`.
 *
 * One residual, stated because it looks like a bug if you meet it: a template with a **null**
 * family — a state the write boundary does not allow, reachable only by import drift — is hidden by
 * every filter, so dragging one out of a group while filtered unmounts the row under the cursor.
 * The drop still commits a complete, valid layout; the template is simply not in this bank.
 */
export function TemplateLayoutList({
  layout,
  family,
  dndEnabled,
  editable,
  onCommit,
  onEditTemplate,
  onDeleteTemplate,
  onRenameGroup,
  onDeleteGroup,
}: {
  /**
   * The **whole** project layout, always — never a filtered one. The reducer and the commit both
   * read it, and the server refuses a body that does not name every template and group.
   */
  layout: LayoutEntry[]
  /** Which bank to draw. Filtering happens here so a drag can still reduce over the whole layout. */
  family: LookFamilyFilter
  dndEnabled: boolean
  editable: boolean
  onCommit: (entries: TemplateLayoutEntryInput[]) => void
  onEditTemplate?: (template: TemplateSummary) => void
  onDeleteTemplate?: (template: TemplateSummary) => void
  onRenameGroup?: (group: TemplateGroup, name: string) => void
  onDeleteGroup?: (group: TemplateGroup) => void
}) {
  const [draft, setDraft] = useState<LayoutEntry[] | null>(null)
  const [activeLabel, setActiveLabel] = useState<string | null>(null)
  const [refusedGroupId, setRefusedGroupId] = useState<number | null>(null)
  const [overGroupId, setOverGroupId] = useState<number | null>(null)
  /**
   * The layout every write reads: the draft mid-drag, else the server's.
   *
   * Held as one binding rather than inlined so `shown` memoizes on its *identity* — `handleDragStart`
   * stores `layout` itself as the first draft, so a drag start changes nothing here and the sortable
   * items array keeps its identity at the moment a re-render would be most disruptive.
   */
  const source = draft ?? layout
  const shown = useMemo(() => filterLayoutByFamily(source, family), [source, family])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const reset = useCallback(() => {
    setDraft(null)
    setActiveLabel(null)
    setRefusedGroupId(null)
    setOverGroupId(null)
  }, [])

  /**
   * The group a hover would put the dragged template **into**, for the join / refusal highlight —
   * so it must answer the same question `moveInLayout` answers. A group's **body** joins, and so
   * does one of its members; its **header** does not (that arm places the template at the group's
   * top-level slot), and lighting the body there promised a join the drop would not perform.
   */
  const groupOf = useCallback((current: LayoutEntry[], overId: string): number | null => {
    const parsed = parseDragId(overId)
    if (!parsed) return null
    if (parsed.kind === 'group') return null
    if (parsed.kind === 'groupBody') return parsed.id
    for (const entry of current) {
      if (entry.kind === 'group' && entry.templates.some((t) => t.id === parsed.id)) return entry.group.id
    }
    return null
  }, [])

  const handleDragStart = useCallback(
    ({ active }: DragStartEvent) => {
      const parsed = parseDragId(String(active.id))
      let label: string | null = null
      for (const entry of layout) {
        if (entry.kind === 'group') {
          if (parsed?.kind === 'group' && entry.group.id === parsed.id) label = entry.group.name
          const member = entry.templates.find((t) => parsed?.kind === 'template' && t.id === parsed.id)
          if (member) label = member.name
        } else if (parsed?.kind === 'template' && entry.template.id === parsed.id) {
          label = entry.template.name
        }
      }
      setDraft(layout)
      setActiveLabel(label)
    },
    [layout],
  )

  const handleDragOver = useCallback(
    ({ active, over }: DragOverEvent) => {
      if (!over) {
        setOverGroupId(null)
        setRefusedGroupId(null)
        return
      }
      const current = source
      const overId = String(over.id)
      const activeKind = parseDragId(String(active.id))?.kind
      // Only a template can join a group, so only a template's hover lights one.
      setOverGroupId(activeKind === 'template' ? groupOf(current, overId) : null)
      const result = moveInLayout(current, String(active.id), overId, 'over')
      if (!result) return
      if (result.refused) {
        setRefusedGroupId(groupOf(current, overId))
        return
      }
      setRefusedGroupId(null)
      setDraft(result.layout)
    },
    [source, groupOf],
  )

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      const current = source
      // The draft is a *preview*, so only a drop the reducer accepts may be committed. A refusal
      // and a release over nothing both fall back to `layout`: the draft can already hold a
      // cross-container move made by a hover on the way past, and committing that beside a "wrong
      // family" toast would regroup a template into a group the operator merely dragged over.
      let final = layout
      if (over) {
        const result = moveInLayout(current, String(active.id), String(over.id), 'end')
        if (result?.refused) {
          toast.error('A group holds one family — that template belongs to another')
        } else {
          final = result ? result.layout : current
        }
      }
      reset()
      // Both sides are complete requests, whatever the filter is showing — which is the whole
      // reason a filtered drag is safe: this compares the project, not the visible slice.
      const before = JSON.stringify(layoutToRequest(layout))
      const after = JSON.stringify(layoutToRequest(final))
      if (before !== after) onCommit(layoutToRequest(final))
    },
    [layout, source, onCommit, reset],
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={reset}
    >
      <SortableContext items={shown.map(layoutEntryId)} strategy={verticalListSortingStrategy}>
        <div className="rounded-lg border divide-y">
          {shown.map((entry) =>
            entry.kind === 'template' ? (
              <SortableTemplateRow
                key={templateDragId(entry.template.id)}
                template={entry.template}
                dndEnabled={dndEnabled}
                onClick={editable && onEditTemplate ? () => onEditTemplate(entry.template) : undefined}
                onDelete={editable && onDeleteTemplate ? () => onDeleteTemplate(entry.template) : undefined}
              />
            ) : (
              <SortableGroup
                key={groupDragId(entry.group.id)}
                entry={entry}
                dndEnabled={dndEnabled}
                editable={editable}
                isOver={overGroupId === entry.group.id}
                refused={refusedGroupId === entry.group.id}
                onRename={onRenameGroup ? (name) => onRenameGroup(entry.group, name) : undefined}
                onDelete={onDeleteGroup ? () => onDeleteGroup(entry.group) : undefined}
              >
                {entry.templates.map((template) => (
                  <SortableTemplateRow
                    key={templateDragId(template.id)}
                    template={template}
                    dndEnabled={dndEnabled}
                    onClick={editable && onEditTemplate ? () => onEditTemplate(template) : undefined}
                    onDelete={editable && onDeleteTemplate ? () => onDeleteTemplate(template) : undefined}
                  />
                ))}
              </SortableGroup>
            ),
          )}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeLabel ? (
          <div className="rounded-md border bg-background px-2 py-1.5 shadow-lg text-sm font-medium opacity-90">
            {activeLabel}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

/** The grip. Listeners go on the handle only, never the row — the row opens the editor on click. */
function DragHandle({
  label,
  listeners,
}: {
  label: string
  listeners: ReturnType<typeof useSortable>['listeners']
}) {
  return (
    <button
      type="button"
      className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground"
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      {...listeners}
    >
      <GripVertical className="size-3.5" />
    </button>
  )
}

function SortableTemplateRow({
  template,
  dndEnabled,
  onClick,
  onDelete,
}: {
  template: TemplateSummary
  dndEnabled: boolean
  onClick?: () => void
  onDelete?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: templateDragId(template.id),
    disabled: !dndEnabled,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TemplateListRow
        template={template}
        dragHandle={dndEnabled ? <DragHandle label={`Reorder ${template.name}`} listeners={listeners} /> : undefined}
        onClick={onClick}
        onDelete={onDelete}
      />
    </div>
  )
}

function SortableGroup({
  entry,
  dndEnabled,
  editable,
  isOver,
  refused,
  onRename,
  onDelete,
  children,
}: {
  entry: Extract<LayoutEntry, { kind: 'group' }>
  dndEnabled: boolean
  editable: boolean
  isOver: boolean
  refused: boolean
  onRename?: (name: string) => void
  onDelete?: () => void
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: groupDragId(entry.group.id),
    disabled: !dndEnabled,
  })
  const { setNodeRef: setBodyRef } = useDroppable({
    id: groupBodyDragId(entry.group.id),
    disabled: !dndEnabled,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  }
  return (
    <div style={style} {...attributes}>
      <TemplateGroupRow
        group={entry.group}
        family={groupFamilyOf(entry)}
        memberCount={entry.templates.length}
        dragHandle={dndEnabled ? <DragHandle label={`Reorder ${entry.group.name}`} listeners={listeners} /> : undefined}
        editable={editable}
        onRename={onRename}
        onDelete={onDelete}
        isOver={isOver}
        refused={refused}
        headerRef={setNodeRef}
        bodyRef={setBodyRef}
      >
        <SortableContext
          items={entry.templates.map((t) => templateDragId(t.id))}
          strategy={verticalListSortingStrategy}
        >
          {children}
        </SortableContext>
      </TemplateGroupRow>
    </div>
  )
}

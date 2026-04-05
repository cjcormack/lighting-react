import { useState, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { GripVertical, Trash2, Plus, X } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  usePatchGroupDetailQuery,
  useUpdatePatchGroupMutation,
  useDeletePatchGroupMutation,
  useUpdatePatchMutation,
} from '@/store/patches'
import type { FixturePatch, PatchGroupMember } from '@/api/patchApi'

interface EditGroupSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: number | null
  groupName: string
  projectId: number
  patches: FixturePatch[]
}

export function EditGroupSheet({ open, onOpenChange, groupId, groupName: initialName, projectId, patches }: EditGroupSheetProps) {
  const { data: groupDetail } = usePatchGroupDetailQuery(
    { projectId, groupId: groupId ?? 0 },
    { skip: !groupId },
  )
  const [updateGroup, { isLoading: isUpdating }] = useUpdatePatchGroupMutation()
  const [deleteGroup, { isLoading: isDeleting }] = useDeletePatchGroupMutation()
  const [updatePatch] = useUpdatePatchMutation()

  const [name, setName] = useState(initialName)
  const [members, setMembers] = useState<PatchGroupMember[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  useEffect(() => {
    if (groupDetail) {
      setName(groupDetail.name)
      setMembers([...groupDetail.members].sort((a, b) => a.sortOrder - b.sortOrder))
    }
  }, [groupDetail])

  useEffect(() => {
    setName(initialName)
  }, [initialName])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setMembers((prev) => {
      const oldIndex = prev.findIndex((m) => m.patchId === active.id)
      const newIndex = prev.findIndex((m) => m.patchId === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  if (!groupId) return null

  const originalOrder = groupDetail?.members.map(m => m.patchId) ?? []
  const currentOrder = members.map(m => m.patchId)
  const orderChanged = JSON.stringify(originalOrder) !== JSON.stringify(currentOrder)
  const nameChanged = name !== (groupDetail?.name ?? initialName)
  const hasChanges = orderChanged || nameChanged
  const isValid = name.trim().length > 0

  const handleSave = async () => {
    const body: Record<string, unknown> = {}
    if (nameChanged) body.name = name.trim()
    if (orderChanged) body.memberOrder = currentOrder
    await updateGroup({ projectId, groupId, ...body }).unwrap()
    onOpenChange(false)
  }

  const handleDelete = async () => {
    await deleteGroup({ projectId, groupId }).unwrap()
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit Group</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Group Name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label>Members ({members.length})</Label>
            <p className="text-xs text-muted-foreground">
              Drag to reorder fixtures within the group.
            </p>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={members.map((m) => m.patchId)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1">
                {members.map((member) => (
                  <SortableMemberRow
                    key={member.patchId}
                    member={member}
                    onRemove={groupId ? async () => {
                      await updatePatch({ projectId, patchId: member.patchId, removeFromGroupId: groupId }).unwrap()
                    } : undefined}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {members.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No members yet.
            </p>
          )}

          <AddFixturesToGroup
            groupName={groupDetail?.name ?? initialName}
            members={members}
            patches={patches}
            projectId={projectId}
            onAdd={async (patchId) => {
              await updatePatch({ projectId, patchId, addToGroup: groupDetail?.name ?? initialName }).unwrap()
            }}
            onRemove={async (patchId) => {
              if (!groupId) return
              await updatePatch({ projectId, patchId, removeFromGroupId: groupId }).unwrap()
            }}
          />

          <Separator />

          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 className="size-3.5 mr-1.5" />
            {isDeleting ? 'Deleting...' : 'Delete Group'}
          </Button>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUpdating}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid || !hasChanges || isUpdating}>
            {isUpdating ? 'Saving...' : 'Save'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function AddFixturesToGroup({
  groupName,
  members,
  patches,
  projectId,
  onAdd,
  onRemove,
}: {
  groupName: string
  members: PatchGroupMember[]
  patches: FixturePatch[]
  projectId: number
  onAdd: (patchId: number) => Promise<void>
  onRemove: (patchId: number) => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const memberPatchIds = new Set(members.map(m => m.patchId))

  const available = patches.filter(p => {
    if (memberPatchIds.has(p.id)) return false
    if (!search) return true
    const q = search.toLowerCase()
    return p.displayName.toLowerCase().includes(q) || p.key.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-1.5">
      <Label>Add Fixtures</Label>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search fixtures..."
        className="h-8 text-xs"
      />
      {available.length > 0 ? (
        <div className="max-h-40 overflow-y-auto space-y-0.5">
          {available.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onAdd(p.id)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left text-xs hover:bg-accent transition-colors"
            >
              <Plus className="size-3 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">{p.displayName}</span>
              <span className="text-muted-foreground truncate">{p.key}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">
          {search ? 'No matching fixtures.' : 'All fixtures are already in this group.'}
        </p>
      )}
    </div>
  )
}

function SortableMemberRow({ member, onRemove }: { member: PatchGroupMember; onRemove?: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: member.patchId })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 rounded-md border bg-card"
    >
      <button
        type="button"
        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{member.fixtureName}</div>
        <div className="text-[11px] text-muted-foreground truncate">{member.fixtureKey}</div>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground/40 hover:text-destructive shrink-0"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

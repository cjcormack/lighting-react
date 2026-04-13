import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { ArrowRight, GripVertical, RotateCcw, X, Plus, SeparatorHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody } from '@/components/ui/sheet'
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
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  useUpdateShowSessionMutation,
  useAddStackToSessionMutation,
  useAddMarkerToSessionMutation,
  useDeleteShowSessionEntryMutation,
  useReorderShowSessionEntriesMutation,
  useUpdateShowSessionEntryMutation,
} from '@/store/showSessions'
import type { ShowSessionDetails, ShowSessionEntryDto } from '@/api/showSessionsApi'
import type { CueStack } from '@/api/cueStacksApi'

// ── Sortable STACK entry row ────────────────────────────────────────────────

interface SortableStackEntryProps {
  entry: ShowSessionEntryDto
  index: number
  stack: CueStack | undefined
  isActive: boolean
  onDrill: (stackId: number) => void
  onRemove: (entryId: number) => void
}

function SortableStackEntry({ entry, index, stack, isActive, onDrill, onRemove }: SortableStackEntryProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  }

  const cueCount = stack?.cues.filter((c) => c.cueType === 'STANDARD').length ?? 0

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={cn(
        'flex items-center w-full gap-3 px-4 py-2.5 bg-card border rounded border-l-[3px] border-l-transparent transition-colors hover:bg-muted/30 hover:border-muted-foreground/20 text-left cursor-pointer',
        isActive && 'border-l-amber-500 bg-amber-500/[0.055]',
      )}
      onClick={() => entry.cueStackId != null && onDrill(entry.cueStackId)}
    >
      <div
        {...listeners}
        className="flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="size-4" />
      </div>
      <span className="w-6 text-center font-mono text-xs text-muted-foreground shrink-0">
        {index + 1}
      </span>
      <span
        className={cn(
          'flex-1 text-sm font-medium text-foreground',
          isActive && 'text-amber-300 font-semibold',
        )}
      >
        {entry.cueStackName ?? entry.label ?? 'Unknown'}
      </span>
      {isActive && (
        <Badge
          variant="outline"
          className="text-xs px-1.5 py-0 gap-1 border-amber-500/40 text-amber-400 bg-amber-500/10"
        >
          <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
          Live
        </Badge>
      )}
      <span className="text-xs text-muted-foreground shrink-0">
        {cueCount} cues &middot; {stack?.loop ? 'Loop' : 'Sequential'}
      </span>
      {stack?.loop && (
        <Badge variant="outline" className="text-xs px-1.5 py-0 gap-1">
          <RotateCcw className="size-2.5" />
          Loop
        </Badge>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="size-5 text-muted-foreground hover:text-destructive shrink-0"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(entry.id)
        }}
      >
        <X className="size-3.5" />
      </Button>
      <ArrowRight className="size-4 text-muted-foreground shrink-0" />
    </div>
  )
}

// ── Sortable MARKER entry row ───────────────────────────────────────────────

interface SortableMarkerEntryProps {
  entry: ShowSessionEntryDto
  projectId: number
  sessionId: number
  onRemove: (entryId: number) => void
}

function SortableMarkerEntry({ entry, projectId, sessionId, onRemove }: SortableMarkerEntryProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  })
  const [updateEntry] = useUpdateShowSessionEntryMutation()

  const [localLabel, setLocalLabel] = useState(entry.label ?? '')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLocalLabel(entry.label ?? '')
  }, [entry.label])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleChange = (value: string) => {
    setLocalLabel(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (value.trim()) {
        updateEntry({ projectId, sessionId, entryId: entry.id, label: value.trim() })
      }
    }, 400)
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="flex items-center gap-2.5 py-1.5 px-4"
    >
      <div
        {...listeners}
        className="flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab"
      >
        <GripVertical className="size-4" />
      </div>
      <div className="flex-1 h-px bg-border" />
      <Input
        value={localLabel}
        onChange={(e) => handleChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        className="h-7 w-auto min-w-[120px] max-w-[200px] text-center text-xs font-medium text-muted-foreground bg-card border-border"
      />
      <div className="flex-1 h-px bg-border" />
      <Button
        variant="ghost"
        size="icon"
        className="size-5 text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => onRemove(entry.id)}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}

// (StackPickerOverlay replaced by Sheet below)

// ── Main SessionOverview ────────────────────────────────────────────────────

interface SessionOverviewProps {
  projectId: number
  session: ShowSessionDetails
  stacks: CueStack[]
  activeStackId: number | null
  onDrillStack: (stackId: number) => void
  onSwitchToShow: () => void
}

export function SessionOverview({
  projectId,
  session,
  stacks,
  activeStackId,
  onDrillStack,
  onSwitchToShow,
}: SessionOverviewProps) {
  const stackMap = useMemo(() => new Map(stacks.map((s) => [s.id, s])), [stacks])
  const addedStackIds = useMemo(
    () => new Set(session.entries.filter((e) => e.entryType === 'STACK' && e.cueStackId != null).map((e) => e.cueStackId!)),
    [session.entries],
  )

  const stackEntries = session.entries.filter((e) => e.entryType === 'STACK')
  const totalCues = stackEntries.reduce((n, e) => {
    const s = e.cueStackId != null ? stackMap.get(e.cueStackId) : null
    return n + (s?.cues.filter((c) => c.cueType === 'STANDARD').length ?? 0)
  }, 0)

  // Session name — debounced inline edit
  const [localName, setLocalName] = useState(session.name)
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [updateSession] = useUpdateShowSessionMutation()

  useEffect(() => {
    setLocalName(session.name)
  }, [session.name])

  useEffect(() => {
    return () => {
      if (nameTimerRef.current) clearTimeout(nameTimerRef.current)
    }
  }, [])

  const handleNameChange = (value: string) => {
    setLocalName(value)
    if (nameTimerRef.current) clearTimeout(nameTimerRef.current)
    nameTimerRef.current = setTimeout(() => {
      if (value.trim()) {
        updateSession({ projectId, sessionId: session.id, name: value.trim() })
      }
    }, 400)
  }

  // Mutations
  const [addStack] = useAddStackToSessionMutation()
  const [addMarker] = useAddMarkerToSessionMutation()
  const [deleteEntry] = useDeleteShowSessionEntryMutation()
  const [reorderEntries] = useReorderShowSessionEntriesMutation()

  // Stack picker sheet
  const [showStackPicker, setShowStackPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')

  const filteredStacks = useMemo(() => {
    if (!pickerSearch.trim()) return stacks
    const q = pickerSearch.toLowerCase()
    return stacks.filter((s) => s.name.toLowerCase().includes(q))
  }, [stacks, pickerSearch])

  const handleAddStack = useCallback(
    (stackId: number) => {
      addStack({ projectId, sessionId: session.id, cueStackId: stackId })
    },
    [addStack, projectId, session.id],
  )

  const handleAddMarker = useCallback(() => {
    addMarker({ projectId, sessionId: session.id, label: 'New Marker' })
  }, [addMarker, projectId, session.id])

  const handleRemoveEntry = useCallback(
    (entryId: number) => {
      deleteEntry({ projectId, sessionId: session.id, entryId })
    },
    [deleteEntry, projectId, session.id],
  )

  // dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = session.entries.findIndex((e) => e.id === active.id)
      const newIndex = session.entries.findIndex((e) => e.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(session.entries, oldIndex, newIndex)
      reorderEntries({
        projectId,
        sessionId: session.id,
        entryIds: reordered.map((e) => e.id),
      })
    },
    [session, projectId, reorderEntries],
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center h-12 px-4 border-b gap-4 shrink-0">
        <input
          className="bg-transparent border-b border-transparent focus:border-primary/50 text-lg font-semibold text-foreground outline-none min-w-[100px] max-w-[260px] transition-colors"
          value={localName}
          onChange={(e) => handleNameChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="text-sm text-muted-foreground">
          {stackEntries.length} stacks &middot; {totalCues} cues
        </span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={handleAddMarker}>
          <SeparatorHorizontal className="size-3.5 mr-1.5" />
          Add Marker
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowStackPicker(true)}>
          <Plus className="size-3.5 mr-1.5" />
          Add Stack
        </Button>
        <Button
          size="sm"
          onClick={onSwitchToShow}
        >
          Ready to run <ArrowRight className="size-3.5 ml-1.5" />
        </Button>
      </div>

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={session.entries.map((e) => e.id)}
            strategy={verticalListSortingStrategy}
          >
            {session.entries.map((entry, idx) => {
              if (entry.entryType === 'MARKER') {
                return (
                  <SortableMarkerEntry
                    key={entry.id}
                    entry={entry}
                    projectId={projectId}
                    sessionId={session.id}
                    onRemove={handleRemoveEntry}
                  />
                )
              }

              const stack = entry.cueStackId != null ? stackMap.get(entry.cueStackId) : undefined

              return (
                <SortableStackEntry
                  key={entry.id}
                  entry={entry}
                  index={idx}
                  stack={stack}
                  isActive={activeStackId !== null && entry.cueStackId === activeStackId}
                  onDrill={onDrillStack}
                  onRemove={handleRemoveEntry}
                />
              )
            })}
          </SortableContext>
        </DndContext>

        {session.entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <p className="text-sm">No stacks in this session yet.</p>
            <Button variant="outline" size="sm" onClick={() => setShowStackPicker(true)}>
              <Plus className="size-3.5 mr-1.5" />
              Add a Stack
            </Button>
          </div>
        )}
      </div>

      {/* Stack picker sheet */}
      <Sheet open={showStackPicker} onOpenChange={(open) => {
        setShowStackPicker(open)
        if (!open) setPickerSearch('')
      }}>
        <SheetContent className="flex flex-col sm:max-w-[380px]">
          <SheetHeader>
            <SheetTitle>Add Stack to Session</SheetTitle>
          </SheetHeader>
          <div className="px-4 shrink-0">
            <Input
              placeholder="Search stacks..."
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              autoFocus
            />
          </div>
          <SheetBody className="space-y-0 p-0">
            {filteredStacks.map((s) => {
              const cueCount = s.cues.filter((c) => c.cueType === 'STANDARD').length
              const added = addedStackIds.has(s.id)
              return (
                <div
                  key={s.id}
                  className="flex items-center px-4 py-2.5 gap-3 border-b border-border/30 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {s.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {cueCount} cues &middot; {s.loop ? 'Loop' : 'Sequential'}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={added ? 'outline' : 'default'}
                    onClick={() => {
                      if (!added) handleAddStack(s.id)
                    }}
                    disabled={added}
                  >
                    {added ? 'Added' : '+ Add'}
                  </Button>
                </div>
              )
            })}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  )
}

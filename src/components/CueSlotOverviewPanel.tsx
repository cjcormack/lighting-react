import { useState, useCallback, useRef, useMemo, useEffect, createContext, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Layers,
  ListMusic,
  Eye,
  Trash2,
  Pencil,
  X,
} from 'lucide-react'
import {
  DndContext,
  useDraggable,
  useDroppable,
  useDndMonitor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import { useCurrentProjectQuery } from '../store/projects'
import {
  useProjectCueSlotsQuery,
  useAssignCueSlotMutation,
  useSwapCueSlotsMutation,
  useClearCueSlotMutation,
  type CueSlot,
} from '../store/cueSlots'
import { useApplyCueMutation, useStopCueMutation, useActiveCueIds, useActiveCueStackIds } from '../store/cues'
import { useActivateCueStackMutation, useDeactivateCueStackMutation } from '../store/cueStacks'
import { EditModeAssignPanel } from './CueSlotEditAssignPanel'

export { type CueSlot } from '../store/cueSlots'

const SLOTS_PER_PAGE = 8
const PAGE_STORAGE_KEY = 'cue-slot-overview-page'

function getInitialPage(): number {
  if (typeof window === 'undefined') return 0
  const stored = localStorage.getItem(PAGE_STORAGE_KEY)
  return stored ? parseInt(stored, 10) || 0 : 0
}

// ─── DnD data types ───────────────────────────────────────────────────

export interface CueSlotAssignDragData {
  type: 'cue-slot-assign'
  itemType: 'cue' | 'cue_stack'
  itemId: number
  itemName: string
}

export interface CueSlotSwapDragData {
  type: 'slot-item'
  page: number
  slotIndex: number
  slot: CueSlot
}

export interface CueSlotDropTargetData {
  type: 'slot-target'
  page: number
  slotIndex: number
}

// ─── Context for DnD + edit mode ─────────────────────────────────────

interface CueSlotDndContextValue {
  isSlotPanelVisible: boolean
  isEditMode: boolean
  enterEditMode: () => void
  exitEditMode: () => void
}

const CueSlotDndContext = createContext<CueSlotDndContextValue>({
  isSlotPanelVisible: false,
  isEditMode: false,
  enterEditMode: () => {},
  exitEditMode: () => {},
})

export function useCueSlotDnd() {
  return useContext(CueSlotDndContext)
}

// ─── Shared visual content ────────────────────────────────────────────

export function SlotItemContent({
  name,
  itemType,
  palette,
}: {
  name: string
  itemType: 'cue' | 'cue_stack'
  palette: string[]
}) {
  const swatches = palette.slice(0, 6)
  return (
    <>
      <span className="text-xs font-medium leading-tight text-center line-clamp-2 w-full">
        {name}
      </span>
      <div className="flex items-center gap-1 mt-0.5">
        {itemType === 'cue_stack' ? (
          <Layers className="size-3 text-muted-foreground shrink-0" />
        ) : (
          <ListMusic className="size-3 text-muted-foreground shrink-0" />
        )}
        {swatches.length > 0 && (
          <div className="flex gap-px">
            {swatches.map((color, i) => (
              <div
                key={i}
                className="size-2.5 rounded-full border border-background"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

interface CueSlotDndProviderProps {
  isVisible: boolean
  children: React.ReactNode
}

export function CueSlotDndProvider({ isVisible, children }: CueSlotDndProviderProps) {
  const { data: currentProject } = useCurrentProjectQuery()
  const projectId = currentProject?.id
  const [assignSlot] = useAssignCueSlotMutation()
  const [swapSlots] = useSwapCueSlotsMutation()
  const [draggedLabel, setDraggedLabel] = useState<string | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)

  const enterEditMode = useCallback(() => setIsEditMode(true), [])
  const exitEditMode = useCallback(() => setIsEditMode(false), [])

  // Auto-exit edit mode when panel hides
  useEffect(() => {
    if (!isVisible) setIsEditMode(false)
  }, [isVisible])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current
    if (data?.type === 'slot-item') {
      setDraggedLabel((data as CueSlotSwapDragData).slot.itemName)
    } else if (data?.type === 'cue-slot-assign') {
      setDraggedLabel((data as CueSlotAssignDragData).itemName)
    }
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggedLabel(null)
      if (!projectId) return

      const { active, over } = event
      if (!over) return

      const activeData = active.data.current
      const overData = over.data.current
      if (!activeData || !overData) return

      // Only handle drops onto slot targets
      if (overData.type !== 'slot-target') return

      const targetPage = (overData as CueSlotDropTargetData).page
      const targetIndex = (overData as CueSlotDropTargetData).slotIndex

      // External cue/stack → slot assignment
      if (activeData.type === 'cue-slot-assign') {
        const { itemType, itemId } = activeData as CueSlotAssignDragData
        assignSlot({
          projectId,
          page: targetPage,
          slotIndex: targetIndex,
          cueId: itemType === 'cue' ? itemId : undefined,
          cueStackId: itemType === 'cue_stack' ? itemId : undefined,
        })
        return
      }

      // Slot → slot swap/move
      if (activeData.type === 'slot-item') {
        const { page: fromPage, slotIndex: fromIndex } = activeData as CueSlotSwapDragData
        if (fromPage === targetPage && fromIndex === targetIndex) return
        swapSlots({
          projectId,
          fromPage,
          fromSlotIndex: fromIndex,
          toPage: targetPage,
          toSlotIndex: targetIndex,
        })
      }
    },
    [projectId, assignSlot, swapSlots],
  )

  return (
    <CueSlotDndContext.Provider value={{ isSlotPanelVisible: isVisible, isEditMode, enterEditMode, exitEditMode }}>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {children}
        <DragOverlay dropAnimation={null}>
          {draggedLabel ? (
            <div className="rounded-md border bg-background px-2 py-1.5 shadow-lg text-sm font-medium opacity-90">
              {draggedLabel}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </CueSlotDndContext.Provider>
  )
}

// ─── Panel component ──────────────────────────────────────────────────

interface CueSlotOverviewPanelProps {
  isVisible: boolean
}

export function CueSlotOverviewPanel({ isVisible }: CueSlotOverviewPanelProps) {
  const { data: currentProject } = useCurrentProjectQuery()
  const projectId = currentProject?.id
  const { data: slots } = useProjectCueSlotsQuery(projectId!, { skip: !projectId })
  const { isEditMode, exitEditMode } = useCueSlotDnd()

  const [page, setPage] = useState(getInitialPage)

  const activeCueIds = useActiveCueIds()
  const activeCueStackIds = useActiveCueStackIds()

  const [applyCue] = useApplyCueMutation()
  const [stopCue] = useStopCueMutation()
  const [activateStack] = useActivateCueStackMutation()
  const [deactivateStack] = useDeactivateCueStackMutation()
  const [clearSlot] = useClearCueSlotMutation()

  const navigate = useNavigate()

  // Build a map of page+slotIndex → CueSlot for current page
  const slotMap = useMemo(() => {
    const map = new Map<string, CueSlot>()
    for (const slot of slots ?? []) {
      map.set(`${slot.page}-${slot.slotIndex}`, slot)
    }
    return map
  }, [slots])

  // Calculate total pages (at least 1, plus one extra empty page for new slots)
  const maxUsedPage = useMemo(() => {
    let max = 0
    for (const slot of slots ?? []) {
      if (slot.page > max) max = slot.page
    }
    return max
  }, [slots])

  const totalPages = Math.max(1, maxUsedPage + 2)

  const setPagePersist = useCallback((p: number) => {
    setPage(p)
    localStorage.setItem(PAGE_STORAGE_KEY, String(p))
  }, [])

  // Swipe handling for touch page navigation
  const swipeStartX = useRef<number | null>(null)
  const swipeStartY = useRef<number | null>(null)
  const swiping = useRef(false)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    swipeStartX.current = e.touches[0].clientX
    swipeStartY.current = e.touches[0].clientY
    swiping.current = false
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (swipeStartX.current === null || swipeStartY.current === null) return
    const dx = e.touches[0].clientX - swipeStartX.current
    const dy = e.touches[0].clientY - swipeStartY.current
    // Only count as swipe if horizontal movement dominates vertical
    if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swiping.current = true
    }
  }, [])

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (swipeStartX.current === null) return
      const dx = e.changedTouches[0].clientX - swipeStartX.current
      if (swiping.current) {
        if (dx < -50 && page < totalPages - 1) {
          setPagePersist(page + 1)
        } else if (dx > 50 && page > 0) {
          setPagePersist(page - 1)
        }
      }
      swipeStartX.current = null
      swipeStartY.current = null
      swiping.current = false
    },
    [page, totalPages, setPagePersist],
  )

  // Trackpad horizontal scroll → page navigation
  // Must use native listener with { passive: false } to allow preventDefault
  const panelRef = useRef<HTMLDivElement>(null)
  const wheelAccum = useRef(0)
  const wheelTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pageRef = useRef(page)
  const totalPagesRef = useRef(totalPages)
  pageRef.current = page
  totalPagesRef.current = totalPages

  useEffect(() => {
    const el = panelRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return

      e.preventDefault()
      wheelAccum.current += e.deltaX

      if (wheelTimeout.current) clearTimeout(wheelTimeout.current)
      wheelTimeout.current = setTimeout(() => {
        wheelAccum.current = 0
      }, 200)

      const threshold = 80
      if (wheelAccum.current > threshold) {
        wheelAccum.current = 0
        setPagePersist(Math.min(totalPagesRef.current - 1, pageRef.current + 1))
      } else if (wheelAccum.current < -threshold) {
        wheelAccum.current = 0
        setPagePersist(Math.max(0, pageRef.current - 1))
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setPagePersist])

  // Dismiss edit mode on click outside panel or Escape key
  useEffect(() => {
    if (!isEditMode) return
    const handlePointerDown = (e: PointerEvent) => {
      const panel = panelRef.current
      if (panel && !panel.contains(e.target as Node)) {
        exitEditMode()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitEditMode()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isEditMode, exitEditMode])

  // Edge-drag page navigation: change page when dragging near left/right edges
  const [isDraggingAny, setIsDraggingAny] = useState(false)
  const edgeScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const edgeScrollDirection = useRef<'left' | 'right' | null>(null)

  const clearEdgeScroll = useCallback(() => {
    if (edgeScrollTimer.current) {
      clearTimeout(edgeScrollTimer.current)
      edgeScrollTimer.current = null
    }
    edgeScrollDirection.current = null
  }, [])

  useDndMonitor({
    onDragStart() {
      setIsDraggingAny(true)
    },
    onDragMove(event) {
      if (!panelRef.current) return
      const rect = panelRef.current.getBoundingClientRect()
      const activator = event.activatorEvent as PointerEvent
      if (!activator.clientX) return
      const currentX = activator.clientX + event.delta.x

      const edgeThreshold = 40
      let direction: 'left' | 'right' | null = null

      if (currentX < rect.left + edgeThreshold && pageRef.current > 0) {
        direction = 'left'
      } else if (currentX > rect.right - edgeThreshold && pageRef.current < totalPagesRef.current - 1) {
        direction = 'right'
      }

      if (direction !== edgeScrollDirection.current) {
        clearEdgeScroll()
        edgeScrollDirection.current = direction
        if (direction) {
          const dir = direction
          edgeScrollTimer.current = setTimeout(() => {
            if (dir === 'left') {
              setPagePersist(Math.max(0, pageRef.current - 1))
            } else {
              setPagePersist(Math.min(totalPagesRef.current - 1, pageRef.current + 1))
            }
            edgeScrollTimer.current = null
            edgeScrollDirection.current = null
          }, 400)
        }
      }
    },
    onDragEnd() {
      setIsDraggingAny(false)
      clearEdgeScroll()
    },
    onDragCancel() {
      setIsDraggingAny(false)
      clearEdgeScroll()
    },
  })

  const handleSlotTap = useCallback(
    (slot: CueSlot) => {
      if (!projectId) return

      if (slot.itemType === 'cue') {
        if (activeCueIds.has(slot.itemId)) {
          stopCue({ projectId, cueId: slot.itemId })
        } else {
          applyCue({ projectId, cueId: slot.itemId })
        }
      } else {
        if (activeCueStackIds.has(slot.itemId)) {
          deactivateStack({ projectId, stackId: slot.itemId })
        } else {
          activateStack({ projectId, stackId: slot.itemId })
        }
      }
    },
    [projectId, activeCueIds, activeCueStackIds, applyCue, stopCue, activateStack, deactivateStack],
  )

  const handleViewSlot = useCallback(
    (slot: CueSlot) => {
      if (slot.itemType === 'cue_stack') {
        navigate(`/projects/${projectId}/cues/stacks/${slot.itemId}`)
      } else {
        navigate(`/projects/${projectId}/cues/all`)
      }
    },
    [navigate, projectId],
  )

  const handleClearSlot = useCallback(
    (slot: CueSlot) => {
      if (!projectId) return
      clearSlot({ projectId, slotId: slot.id })
    },
    [projectId, clearSlot],
  )

  const slotsForPage = useMemo(() => {
    const result: (CueSlot | null)[] = []
    for (let i = 0; i < SLOTS_PER_PAGE; i++) {
      result.push(slotMap.get(`${page}-${i}`) ?? null)
    }
    return result
  }, [slotMap, page])

  return (
    <div
      className={cn(
        'grid transition-all duration-200 ease-in-out',
        isVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
    >
      <div className="overflow-hidden">
        <div
          ref={panelRef}
          className="border-b bg-background px-4 py-3"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Edit mode header */}
          {isEditMode && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Editing slots</span>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={exitEditMode}>
                Done
              </Button>
            </div>
          )}

          {/* Slot grid */}
          <div className="relative">
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {slotsForPage.map((slot, index) => (
                <CueSlotCell
                  key={`${page}-${index}`}
                  slot={slot}
                  page={page}
                  slotIndex={index}
                  isActive={
                    slot
                      ? slot.itemType === 'cue'
                        ? activeCueIds.has(slot.itemId)
                        : activeCueStackIds.has(slot.itemId)
                      : false
                  }
                  isEditMode={isEditMode}
                  onTap={handleSlotTap}
                  onView={handleViewSlot}
                  onClear={handleClearSlot}
                />
              ))}
            </div>
            {/* Edge indicators during drag */}
            {isDraggingAny && page > 0 && (
              <div className="absolute inset-y-0 -left-3 w-3 bg-gradient-to-r from-primary/20 to-transparent pointer-events-none" />
            )}
            {isDraggingAny && page < totalPages - 1 && (
              <div className="absolute inset-y-0 -right-3 w-3 bg-gradient-to-l from-primary/20 to-transparent pointer-events-none" />
            )}
          </div>

          {/* Page dots */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-2">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPagePersist(i)}
                  className={cn(
                    'rounded-full transition-all',
                    i === page
                      ? 'size-2 bg-primary'
                      : 'size-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50',
                  )}
                />
              ))}
            </div>
          )}

          {/* Edit mode assign panel (inline, not portalled) */}
          {projectId && (
            <div
              className={cn(
                'grid transition-all duration-200 ease-in-out',
                isEditMode ? 'grid-rows-[1fr] mt-3' : 'grid-rows-[0fr]',
              )}
            >
              <div className="overflow-hidden">
                <EditModeAssignPanel projectId={projectId} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Slot cell component ──────────────────────────────────────────────

interface CueSlotCellProps {
  slot: CueSlot | null
  page: number
  slotIndex: number
  isActive: boolean
  isEditMode: boolean
  onTap: (slot: CueSlot) => void
  onView: (slot: CueSlot) => void
  onClear: (slot: CueSlot) => void
}

function CueSlotCell({
  slot,
  page,
  slotIndex,
  isActive,
  isEditMode,
  onTap,
  onView,
  onClear,
}: CueSlotCellProps) {
  const { enterEditMode } = useCueSlotDnd()
  const droppableId = `slot-${page}-${slotIndex}`

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: droppableId,
    data: { type: 'slot-target', page, slotIndex } satisfies CueSlotDropTargetData,
  })

  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: slot ? `slot-item-${slot.id}` : `empty-${page}-${slotIndex}`,
    data: slot
      ? ({ type: 'slot-item', page, slotIndex, slot } satisfies CueSlotSwapDragData)
      : undefined,
    disabled: !slot || !isEditMode,
  })

  // Long-press + two-stage press state
  const triggerRef = useRef<HTMLDivElement>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editModeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)
  const startPos = useRef<{ x: number; y: number } | null>(null)
  const isLongPressPointer = useRef(false)

  const clearPress = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
    if (editModeTimer.current) {
      clearTimeout(editModeTimer.current)
      editModeTimer.current = null
    }
    startPos.current = null
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 2) return
      isLongPressPointer.current = true
      didLongPress.current = false
      startPos.current = { x: e.clientX, y: e.clientY }
      const clientX = e.clientX
      const clientY = e.clientY
      pressTimer.current = setTimeout(() => {
        didLongPress.current = true
        pressTimer.current = null
        // Stage 1: Open context menu
        triggerRef.current?.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            clientX,
            clientY,
          }),
        )
        // Stage 2: If still holding after another 500ms, dismiss menu and enter edit mode
        editModeTimer.current = setTimeout(() => {
          editModeTimer.current = null
          if (isLongPressPointer.current) {
            // Dismiss the Radix context menu by dispatching Escape
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
            navigator.vibrate?.(10)
            enterEditMode()
          }
        }, 500)
      }, 500)
    },
    [enterEditMode],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startPos.current) return
      const dx = e.clientX - startPos.current.x
      const dy = e.clientY - startPos.current.y
      if (dx * dx + dy * dy > 10 * 10) {
        clearPress()
      }
    },
    [clearPress],
  )

  const handlePointerUp = useCallback(() => {
    if (!isLongPressPointer.current) return
    isLongPressPointer.current = false
    const wasLongPress = didLongPress.current
    clearPress()
    if (!wasLongPress && slot && !isEditMode) {
      onTap(slot)
    }
  }, [clearPress, slot, onTap, isEditMode])

  // In edit mode, dnd-kit handles pointer events for dragging; otherwise our custom handlers
  const pointerHandlers = isEditMode
    ? {}
    : {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerCancel: clearPress,
      }

  // Merge refs for drag and drop
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDropRef(node)
      setDragRef(node)
      ;(triggerRef as React.MutableRefObject<HTMLDivElement | null>).current = node
    },
    [setDropRef, setDragRef],
  )

  // Empty slot — drop target + context menu / long-press for "Edit slots"
  if (!slot) {
    const emptyPointerHandlers = isEditMode
      ? {}
      : {
          onPointerDown: handlePointerDown,
          onPointerMove: handlePointerMove,
          onPointerUp: handlePointerUp,
          onPointerCancel: clearPress,
        }

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={(node) => {
              setDropRef(node)
              ;(triggerRef as React.MutableRefObject<HTMLDivElement | null>).current = node
            }}
            {...emptyPointerHandlers}
            className={cn(
              'rounded-md border-2 border-dashed flex items-center justify-center min-h-[3.5rem] transition-colors touch-none select-none',
              isOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 text-muted-foreground/40',
            )}
          >
            <span className="text-xs">{isOver ? '+' : '—'}</span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={enterEditMode}>
            <Pencil className="mr-2 size-4" />
            Edit slots
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  // Filled slot
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setRef}
          {...dragAttributes}
          {...dragListeners}
          {...pointerHandlers}
          className={cn(
            'relative rounded-md border flex flex-col items-center justify-center gap-0.5 min-h-[3.5rem] px-1.5 py-1 select-none transition-all touch-none',
            isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
            isActive && !isEditMode && 'border-primary bg-primary/20',
            !isActive && !isEditMode && 'hover:bg-muted/50',
            isOver && 'ring-2 ring-primary ring-offset-1',
            isDragging && 'opacity-40',
            isEditMode && !isDragging && 'animate-[wiggle_0.3s_ease-in-out_infinite]',
          )}
          style={{
            animationDelay: isEditMode && !isDragging ? `${slotIndex * 50}ms` : undefined,
          }}
        >
          {/* Edit mode X button */}
          {isEditMode && (
            <button
              className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm z-10"
              onClick={(e) => {
                e.stopPropagation()
                onClear(slot)
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <X className="size-3" />
            </button>
          )}

          <SlotItemContent name={slot.itemName} itemType={slot.itemType} palette={slot.palette} />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onView(slot)}>
          <Eye className="mr-2 size-4" />
          View
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={enterEditMode}>
          <Pencil className="mr-2 size-4" />
          Edit slots
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => onClear(slot)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 size-4" />
          Clear slot
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

import { useState, useRef, useEffect, useCallback } from 'react'
import { GripVertical, X } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Input } from '@/components/ui/input'

interface ProgramMarkerRowProps {
  id: number
  name: string
  onRename: (name: string) => void
  onDelete: () => void
  /** Show-safe mode: no dragging, no renaming, no deleting. */
  locked?: boolean
}

export function ProgramMarkerRow({
  id,
  name,
  onRename,
  onDelete,
  locked = false,
}: ProgramMarkerRowProps) {
  const [localName, setLocalName] = useState(name)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: locked,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  }

  useEffect(() => {
    setLocalName(name)
  }, [name])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const debouncedRename = useCallback(
    (value: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        if (value.trim()) onRename(value.trim())
      }, 400)
    },
    [onRename],
  )

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="flex items-center gap-2.5 py-2 px-4 hover:bg-muted/10 transition-colors"
    >
      {/* Locked, a separator is just a labelled divider: the column is kept so rows do not shift,
          but the grip, the editable label and the delete are all absent. */}
      {locked ? (
        <div className="size-4" />
      ) : (
        <div
          {...listeners}
          className="flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab"
        >
          <GripVertical className="size-4" />
        </div>
      )}
      <div className="flex-1 h-px bg-border" />
      {locked ? (
        <span className="px-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {localName}
        </span>
      ) : (
        <Input
          value={localName}
          onChange={(e) => {
            setLocalName(e.target.value)
            debouncedRename(e.target.value)
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-7 w-auto min-w-[120px] max-w-[200px] text-center text-xs font-medium text-muted-foreground bg-card border-border"
        />
      )}
      <div className="flex-1 h-px bg-border" />
      {!locked && (
        <button
          className="size-5 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

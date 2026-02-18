import { useState, useCallback, useMemo } from 'react'
import { HexColorPicker } from 'react-colorful'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
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
  horizontalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  resolveColourToHex,
  parseExtendedColour,
  serializeExtendedColour,
  isValidHexColour,
  COLOUR_PRESETS,
  type ExtendedColour,
} from './colourUtils'

interface FxColourListPickerProps {
  value: string
  onChange: (value: string) => void
  label?: string
  description?: string
  extendedChannels?: {
    white?: boolean
    amber?: boolean
    uv?: boolean
  }
}

interface ColourItem {
  id: string
  colour: ExtendedColour
}

let nextId = 0
function makeId(): string {
  return `colour-${nextId++}`
}

export function FxColourListPicker({
  value,
  onChange,
  label,
  description,
  extendedChannels,
}: FxColourListPickerProps) {
  const [items, setItems] = useState<ColourItem[]>(() => parseColourList(value))
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  // Sync from parent value changes (e.g. loading an existing effect)
  // We only re-parse if the serialized form actually differs
  const serialized = useMemo(
    () => items.map((i) => serializeExtendedColour(i.colour)).join(','),
    [items]
  )

  const emitChange = useCallback(
    (newItems: ColourItem[]) => {
      setItems(newItems)
      onChange(newItems.map((i) => serializeExtendedColour(i.colour)).join(','))
    },
    [onChange]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = items.findIndex((i) => i.id === active.id)
      const newIndex = items.findIndex((i) => i.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      emitChange(arrayMove(items, oldIndex, newIndex))
    },
    [items, emitChange]
  )

  const handleColourChange = useCallback(
    (index: number, colour: ExtendedColour) => {
      const newItems = [...items]
      newItems[index] = { ...newItems[index], colour }
      emitChange(newItems)
    },
    [items, emitChange]
  )

  const handleAdd = useCallback(() => {
    const newItems = [...items, { id: makeId(), colour: { hex: '#ffffff', white: 0, amber: 0, uv: 0 } }]
    emitChange(newItems)
    setEditingIndex(newItems.length - 1)
  }, [items, emitChange])

  const handleRemove = useCallback(
    (index: number) => {
      const newItems = items.filter((_, i) => i !== index)
      emitChange(newItems)
      if (editingIndex === index) setEditingIndex(null)
      else if (editingIndex !== null && editingIndex > index) setEditingIndex(editingIndex - 1)
    },
    [items, emitChange, editingIndex]
  )

  return (
    <div>
      {label && <Label className="text-xs mb-1.5 block">{label}</Label>}
      {description && (
        <p className="text-[11px] text-muted-foreground mb-1">{description}</p>
      )}
      <div className="flex items-center gap-1 flex-wrap">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={horizontalListSortingStrategy}
          >
            {items.map((item, index) => (
              <SortableColourSwatch
                key={item.id}
                item={item}
                index={index}
                isEditing={editingIndex === index}
                onEdit={() => setEditingIndex(editingIndex === index ? null : index)}
                onRemove={() => handleRemove(index)}
                onColourChange={(colour) => handleColourChange(index, colour)}
                extendedChannels={extendedChannels}
              />
            ))}
          </SortableContext>
        </DndContext>
        <button
          type="button"
          onClick={handleAdd}
          className="w-7 h-7 rounded border border-dashed border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors text-sm"
          title="Add colour"
        >
          +
        </button>
      </div>
    </div>
  )
}

function SortableColourSwatch({
  item,
  index,
  isEditing,
  onEdit,
  onRemove,
  onColourChange,
  extendedChannels,
}: {
  item: ColourItem
  index: number
  isEditing: boolean
  onEdit: () => void
  onRemove: () => void
  onColourChange: (colour: ExtendedColour) => void
  extendedChannels?: {
    white?: boolean
    amber?: boolean
    uv?: boolean
  }
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  }

  const [hexInput, setHexInput] = useState(item.colour.hex)

  const handleHexChange = useCallback(
    (hex: string) => {
      setHexInput(hex)
      const normalized = hex.startsWith('#') ? hex : `#${hex}`
      if (isValidHexColour(normalized)) {
        onColourChange({ ...item.colour, hex: normalized.toLowerCase() })
      }
    },
    [onColourChange, item.colour]
  )

  const handlePickerChange = useCallback(
    (hex: string) => {
      const lower = hex.toLowerCase()
      setHexInput(lower)
      onColourChange({ ...item.colour, hex: lower })
    },
    [onColourChange, item.colour]
  )

  const handleExtendedChange = useCallback(
    (channel: 'white' | 'amber' | 'uv', val: number) => {
      onColourChange({ ...item.colour, [channel]: val })
    },
    [onColourChange, item.colour]
  )

  const hasExtended =
    extendedChannels?.white || extendedChannels?.amber || extendedChannels?.uv

  return (
    <Popover
      open={isEditing}
      onOpenChange={(open) => {
        if (!open && isEditing) onEdit()
      }}
    >
      <div ref={setNodeRef} style={style} className="relative group">
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-7 h-7 rounded border border-border cursor-grab active:cursor-grabbing"
            style={{ backgroundColor: item.colour.hex }}
            onClick={onEdit}
            {...attributes}
            {...listeners}
          />
        </PopoverTrigger>
        {/* Remove button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove"
        >
          x
        </button>
      </div>
      <PopoverContent className="w-auto p-3" align="start" side="right">
        <div className="space-y-3">
          <HexColorPicker color={item.colour.hex} onChange={handlePickerChange} />

          {/* Hex input */}
          <input
            type="text"
            value={hexInput}
            onChange={(e) => handleHexChange(e.target.value)}
            className="w-full h-7 px-2 text-xs font-mono rounded border border-input bg-background"
            spellCheck={false}
          />

          {/* Quick presets */}
          <div className="flex gap-1 flex-wrap">
            {COLOUR_PRESETS.map((preset) => (
              <button
                key={preset.hex}
                type="button"
                title={preset.name}
                className="w-5 h-5 rounded border border-border hover:scale-110 transition-transform"
                style={{ backgroundColor: preset.hex }}
                onClick={() => {
                  setHexInput(preset.hex)
                  onColourChange({ ...item.colour, hex: preset.hex })
                }}
              />
            ))}
          </div>

          {/* Extended channels */}
          {hasExtended && (
            <div className="space-y-2 pt-2 border-t border-border">
              {extendedChannels?.white && (
                <ExtendedSlider
                  label="White"
                  value={item.colour.white}
                  onChange={(v) => handleExtendedChange('white', v)}
                  color="#fffbe6"
                />
              )}
              {extendedChannels?.amber && (
                <ExtendedSlider
                  label="Amber"
                  value={item.colour.amber}
                  onChange={(v) => handleExtendedChange('amber', v)}
                  color="#ffbf00"
                />
              )}
              {extendedChannels?.uv && (
                <ExtendedSlider
                  label="UV"
                  value={item.colour.uv}
                  onChange={(v) => handleExtendedChange('uv', v)}
                  color="#7f00ff"
                />
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ExtendedSlider({
  label,
  value,
  onChange,
  color,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  color: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] flex items-center gap-1">
          <span
            className="inline-block w-2 h-2 rounded-full border border-border"
            style={{ backgroundColor: color }}
          />
          {label}
        </span>
        <span className="text-[11px] text-muted-foreground font-mono">{value}</span>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={255}
        step={1}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  )
}

/** Parse a comma-separated colour list into ColourItem array */
function parseColourList(value: string): ColourItem[] {
  if (!value.trim()) return []
  return value.split(',').map((s) => ({
    id: makeId(),
    colour: parseExtendedColour(s.trim()),
  }))
}

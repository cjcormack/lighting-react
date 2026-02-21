import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
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
  parseExtendedColour,
  serializeExtendedColour,
  isValidHexColour,
  COLOUR_PRESETS,
  type ExtendedColour,
} from '@/components/fx/colourUtils'
import {
  useFxStateQuery,
  setPalette,
} from '@/store/fx'
import { Check, Palette, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PaletteItem {
  id: string
  raw: string
  colour: ExtendedColour
}

let nextId = 0
function makeId(): string {
  return `pal-${nextId++}`
}

function parsePaletteItems(palette: string[]): PaletteItem[] {
  return palette.map((raw) => ({
    id: makeId(),
    raw,
    colour: parseExtendedColour(raw),
  }))
}

function serializeItems(items: PaletteItem[]): string[] {
  return items.map((i) => serializeExtendedColour(i.colour))
}

function paletteEquals(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

export function PalettePanel({ label, compact }: { label?: string; compact?: boolean } = {}) {
  const { data: fxState } = useFxStateQuery()
  const serverPalette = fxState?.palette ?? []

  // Draft state — all edits are local until "Apply"
  const [items, setItems] = useState<PaletteItem[]>(() => parsePaletteItems(serverPalette))
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  // Track server palette to sync when not dirty
  const prevServerRef = useRef<string[]>([])
  const isDirty = useMemo(
    () => !paletteEquals(serializeItems(items), serverPalette),
    [items, serverPalette],
  )

  useEffect(() => {
    const prev = prevServerRef.current
    const changed =
      prev.length !== serverPalette.length ||
      prev.some((v, i) => v !== serverPalette[i])
    if (changed) {
      prevServerRef.current = serverPalette
      // Only sync from server when draft is clean
      if (!isDirty) {
        setItems(parsePaletteItems(serverPalette))
      }
    }
  }, [serverPalette, isDirty])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = items.findIndex((i) => i.id === active.id)
      const newIndex = items.findIndex((i) => i.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      setItems(arrayMove(items, oldIndex, newIndex))
    },
    [items],
  )

  const handleColourChange = useCallback(
    (index: number, colour: ExtendedColour) => {
      const serialized = serializeExtendedColour(colour)
      setItems((prev) => {
        const next = [...prev]
        next[index] = { ...next[index], colour, raw: serialized }
        return next
      })
    },
    [],
  )

  const handleAdd = useCallback(() => {
    const newColour = '#ffffff'
    setItems((prev) => [
      ...prev,
      { id: makeId(), raw: newColour, colour: parseExtendedColour(newColour) },
    ])
    setEditingIndex(items.length)
  }, [items.length])

  const handleRemove = useCallback(
    (index: number) => {
      setItems((prev) => prev.filter((_, i) => i !== index))
      if (editingIndex === index) setEditingIndex(null)
      else if (editingIndex !== null && editingIndex > index)
        setEditingIndex(editingIndex - 1)
    },
    [editingIndex],
  )

  const handleApply = useCallback(() => {
    const colours = serializeItems(items)
    setPalette(colours)
    prevServerRef.current = colours
  }, [items])

  const handleRevert = useCallback(() => {
    setItems(parsePaletteItems(serverPalette))
    setEditingIndex(null)
  }, [serverPalette])

  return (
    <div className={cn("flex items-center gap-2", compact && "shrink-0")}>
      <div className={cn("flex items-center text-muted-foreground shrink-0", compact ? "gap-1" : "gap-1.5")}>
        <Palette className={compact ? "size-3" : "size-3.5"} />
        {!compact && (
          <Label className="text-xs">{label ? `${label} Palette` : 'Palette'}</Label>
        )}
      </div>
      <div className={cn("flex items-center gap-1", compact ? "flex-nowrap" : "flex-wrap")}>
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
              <SortablePaletteSwatch
                key={item.id}
                item={item}
                index={index}
                compact={compact}
                isEditing={editingIndex === index}
                onEdit={() =>
                  setEditingIndex(editingIndex === index ? null : index)
                }
                onRemove={() => handleRemove(index)}
                onColourChange={(colour) => handleColourChange(index, colour)}
              />
            ))}
          </SortableContext>
        </DndContext>
        <button
          type="button"
          onClick={handleAdd}
          className={cn(
            "rounded border border-dashed border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors text-sm",
            compact ? "w-6 h-6" : "w-7 h-7"
          )}
          title="Add colour"
        >
          +
        </button>
      </div>
      {/* Apply / Revert — only shown when draft differs from server */}
      {isDirty && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleApply}
            className="w-7 h-7 rounded border border-border flex items-center justify-center text-emerald-500 hover:bg-emerald-500/10 transition-colors"
            title="Apply palette"
          >
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={handleRevert}
            className="w-7 h-7 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            title="Revert changes"
          >
            <Undo2 className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

function SortablePaletteSwatch({
  item,
  index,
  compact,
  isEditing,
  onEdit,
  onRemove,
  onColourChange,
}: {
  item: PaletteItem
  index: number
  compact?: boolean
  isEditing: boolean
  onEdit: () => void
  onRemove: () => void
  onColourChange: (colour: ExtendedColour) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  }

  const [hexInput, setHexInput] = useState(item.colour.hex)

  // Sync hex input when colour changes (e.g. from preset click or revert)
  useEffect(() => {
    setHexInput(item.colour.hex)
  }, [item.colour.hex])

  const handleHexChange = useCallback(
    (hex: string) => {
      setHexInput(hex)
      const normalized = hex.startsWith('#') ? hex : `#${hex}`
      if (isValidHexColour(normalized)) {
        onColourChange({ ...item.colour, hex: normalized.toLowerCase() })
      }
    },
    [onColourChange, item.colour],
  )

  const handlePickerChange = useCallback(
    (hex: string) => {
      const lower = hex.toLowerCase()
      setHexInput(lower)
      onColourChange({ ...item.colour, hex: lower })
    },
    [onColourChange, item.colour],
  )

  const handleExtendedChange = useCallback(
    (channel: 'white' | 'amber' | 'uv', val: number) => {
      onColourChange({ ...item.colour, [channel]: val })
    },
    [onColourChange, item.colour],
  )

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
            className={cn(
              "rounded border border-border cursor-grab active:cursor-grabbing relative overflow-hidden",
              compact ? "w-6 h-6" : "w-7 h-7"
            )}
            style={{ backgroundColor: item.colour.hex }}
            onClick={onEdit}
            {...attributes}
            {...listeners}
          >
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold leading-none drop-shadow-[0_0_2px_rgba(0,0,0,0.8)] text-white/90 pointer-events-none">
              P{index + 1}
            </span>
          </button>
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
      <PopoverContent className="w-auto p-3" align="start" side="bottom">
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

          {/* Extended channels (always shown for palette — it's global, not fixture-specific) */}
          <div className="space-y-2 pt-2 border-t border-border">
            <ExtendedSlider
              label="White"
              value={item.colour.white}
              onChange={(v) => handleExtendedChange('white', v)}
              color="#fffbe6"
            />
            <ExtendedSlider
              label="Amber"
              value={item.colour.amber}
              onChange={(v) => handleExtendedChange('amber', v)}
              color="#ffbf00"
            />
            <ExtendedSlider
              label="UV"
              value={item.colour.uv}
              onChange={(v) => handleExtendedChange('uv', v)}
              color="#7f00ff"
            />
          </div>
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
        <span className="text-[11px] text-muted-foreground font-mono">
          {value}
        </span>
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

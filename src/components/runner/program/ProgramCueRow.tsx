import { useState, useEffect, useRef, useCallback } from 'react'
import {
  GripVertical,
  ChevronDown,
  ChevronRight,
  Pencil,
  Palette,
  Bookmark,
  AudioWaveform,
  Zap,
  Play,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatMs } from '@/lib/formatMs'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CueFxTable } from '@/components/cues/CueFxTable'
import { buildCueInput } from '@/lib/cueUtils'
import { useSaveProjectCueMutation } from '@/store/cues'
import type { Cue, CueInput } from '@/api/cuesApi'
import type { CueStackCueEntry } from '@/api/cueStacksApi'
import type { FxPreset } from '@/api/fxPresetsApi'
import type { EffectLibraryEntry } from '@/store/fixtureFx'

const CURVE_LABELS: Record<string, string> = {
  LINEAR: 'LIN',
  EASE_IN_OUT: 'SINE',
  SINE_IN_OUT: 'SINE',
  CUBIC_IN_OUT: 'CUB',
  EASE_IN: '\u2191',
  EASE_OUT: '\u2193',
}

interface ProgramCueRowProps {
  cue: CueStackCueEntry
  fullCue?: Cue
  projectId: number
  presets?: FxPreset[]
  library?: EffectLibraryEntry[]
  isActive?: boolean
  onOpenCueForm: () => void
}

export function ProgramCueRow({
  cue,
  fullCue,
  projectId,
  presets,
  library,
  isActive = false,
  onOpenCueForm,
}: ProgramCueRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [editMode, setEditMode] = useState(false)

  // Reset edit mode when collapsed
  useEffect(() => {
    if (!expanded) setEditMode(false)
  }, [expanded])

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cue.id })

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  }

  const presetCount = cue.presetCount ?? 0
  const adHocCount = cue.adHocEffectCount ?? 0
  const triggerCount = fullCue?.triggers.length ?? 0
  const paletteSize = cue.paletteSize ?? 0
  const hasExpandableContent = fullCue && (
    fullCue.presetApplications.length > 0 ||
    fullCue.adHocEffects.length > 0 ||
    fullCue.triggers.length > 0
  )

  const fadeText =
    cue.fadeDurationMs != null && cue.fadeDurationMs > 0
      ? `${formatMs(cue.fadeDurationMs)} ${CURVE_LABELS[cue.fadeCurve] ?? ''}`
      : 'SNAP'

  // ── Inline timing editing ──
  const [saveCue] = useSaveProjectCueMutation()
  const pendingInputs = useRef<Map<number, CueInput>>(new Map())
  const saveTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const handleInlineTimingChange = useCallback(
    (variant: 'presets' | 'effects' | 'triggers', itemIndex: number, field: string, value: number | null) => {
      if (!fullCue) return

      let input = pendingInputs.current.get(cue.id)
      if (!input) {
        input = buildCueInput(fullCue)
        pendingInputs.current.set(cue.id, input)
      }

      if (variant === 'presets' && input.presetApplications[itemIndex]) {
        const pa = input.presetApplications[itemIndex]
        if (field === 'delayMs') pa.delayMs = value
        else if (field === 'intervalMs') pa.intervalMs = value
        else if (field === 'randomWindowMs') pa.randomWindowMs = value
      } else if (variant === 'effects' && input.adHocEffects[itemIndex]) {
        const eff = input.adHocEffects[itemIndex]
        if (field === 'delayMs') eff.delayMs = value
        else if (field === 'intervalMs') eff.intervalMs = value
        else if (field === 'randomWindowMs') eff.randomWindowMs = value
        else if (field === 'beatDivision' && value != null) eff.beatDivision = value
      } else if (variant === 'triggers' && input.triggers?.[itemIndex]) {
        const t = input.triggers[itemIndex]
        if (field === 'delayMs') t.delayMs = value
        else if (field === 'intervalMs') t.intervalMs = value
        else if (field === 'randomWindowMs') t.randomWindowMs = value
      }

      const existing = saveTimers.current.get(cue.id)
      if (existing) clearTimeout(existing)
      saveTimers.current.set(
        cue.id,
        setTimeout(() => {
          saveTimers.current.delete(cue.id)
          const pending = pendingInputs.current.get(cue.id)
          if (pending) {
            pendingInputs.current.delete(cue.id)
            saveCue({ projectId, cueId: cue.id, ...pending })
          }
        }, 300),
      )
    },
    [fullCue, cue.id, projectId, saveCue],
  )

  const handleInlineRemove = useCallback(
    async (variant: 'presets' | 'effects' | 'triggers', itemIndex: number) => {
      if (!fullCue) return

      const input = pendingInputs.current.get(cue.id) ?? buildCueInput(fullCue)
      pendingInputs.current.delete(cue.id)

      if (variant === 'presets') input.presetApplications.splice(itemIndex, 1)
      else if (variant === 'effects') input.adHocEffects.splice(itemIndex, 1)
      else if (variant === 'triggers') input.triggers?.splice(itemIndex, 1)

      saveCue({ projectId, cueId: cue.id, ...input })
    },
    [fullCue, cue.id, projectId, saveCue],
  )

  return (
    <div ref={setNodeRef} style={sortableStyle} {...attributes} data-cue-row={cue.id}>
      <div
        className={cn(
          'flex items-center h-10 px-4 border-b border-l-[3px] border-l-transparent cursor-pointer transition-colors hover:bg-muted/50',
          expanded && 'bg-muted/10',
          isActive && 'border-l-amber-500 bg-amber-500/[0.055]',
        )}
        onClick={onOpenCueForm}
      >
        {/* Drag handle */}
        <div
          className="w-8 px-2 shrink-0 flex items-center text-muted-foreground hover:text-foreground cursor-grab"
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="size-4" />
        </div>

        {/* Q number */}
        <div className="w-14 px-2 shrink-0 font-mono text-xs text-muted-foreground">
          {cue.cueNumber ? `Q${cue.cueNumber}` : '\u2014'}
        </div>

        {/* Name (with live indicator when this cue is on stage) */}
        <div className="flex-1 px-2 min-w-0 flex items-center gap-1.5">
          {isActive && (
            <Play className="size-3 fill-amber-400 text-amber-400 shrink-0" />
          )}
          <span
            className={cn(
              'text-sm font-medium truncate',
              isActive ? 'text-amber-300 font-semibold' : 'text-foreground',
            )}
          >
            {cue.name}
          </span>
        </div>

        {/* Fade */}
        <div className="w-24 px-2 shrink-0 text-right font-mono text-xs text-muted-foreground">
          {fadeText}
        </div>

        {/* Auto pill */}
        <div className="w-12 px-2 shrink-0 text-center">
          {cue.autoAdvance && (
            <Badge
              variant="outline"
              className="text-xs border-blue-500/30 text-blue-500 bg-blue-500/10 rounded-sm px-1.5 py-0"
            >
              Auto
            </Badge>
          )}
        </div>

        {/* Count badges */}
        <div className="flex items-center gap-1 px-2 shrink-0">
          {paletteSize > 0 && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 gap-1">
              <Palette className="size-3" />
              {paletteSize}
            </Badge>
          )}
          {presetCount > 0 && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 gap-1">
              <Bookmark className="size-3" />
              {presetCount}
            </Badge>
          )}
          {adHocCount > 0 && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 gap-1">
              <AudioWaveform className="size-3" />
              {adHocCount}
            </Badge>
          )}
          {triggerCount > 0 && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 gap-1">
              <Zap className="size-3" />
              {triggerCount}
            </Badge>
          )}
        </div>

        {/* Expand/collapse toggle */}
        {hasExpandableContent ? (
          <button
            className="size-8 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
          >
            {expanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
        ) : (
          <div className="size-8 shrink-0" />
        )}
      </div>

      {/* Expanded FX detail */}
      {expanded && hasExpandableContent && fullCue && (
        <div className="px-3 pb-3 pt-1 space-y-2 ml-8 bg-accent/30 border-b">
          {/* Edit mode toggle */}
          <div className="flex justify-end">
            <button
              className={cn(
                'size-6 flex items-center justify-center rounded transition-colors',
                editMode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
              onClick={(e) => {
                e.stopPropagation()
                setEditMode(!editMode)
              }}
              title={editMode ? 'Exit edit mode' : 'Edit inline'}
            >
              <Pencil className="size-3.5" />
            </button>
          </div>

          <CueFxTable
            variant="presets"
            items={fullCue.presetApplications}
            onTimingChange={
              editMode
                ? (idx, field, val) => handleInlineTimingChange('presets', idx, field, val)
                : undefined
            }
            onRemove={
              editMode
                ? (idx) => handleInlineRemove('presets', idx)
                : undefined
            }
            presets={presets}
          />
          <CueFxTable
            variant="effects"
            items={fullCue.adHocEffects}
            onTimingChange={
              editMode
                ? (idx, field, val) => handleInlineTimingChange('effects', idx, field, val)
                : undefined
            }
            onRemove={
              editMode
                ? (idx) => handleInlineRemove('effects', idx)
                : undefined
            }
            library={library}
          />
          <CueFxTable
            variant="triggers"
            items={fullCue.triggers}
            onTimingChange={
              editMode
                ? (idx, field, val) => handleInlineTimingChange('triggers', idx, field, val)
                : undefined
            }
            onRemove={
              editMode
                ? (idx) => handleInlineRemove('triggers', idx)
                : undefined
            }
          />
        </div>
      )}
    </div>
  )
}

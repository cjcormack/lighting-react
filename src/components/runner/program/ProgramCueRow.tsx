import { useState, useEffect, useCallback } from 'react'
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
  Circle,
} from 'lucide-react'
import { useMediaQuery, SM_BREAKPOINT } from '@/hooks/useMediaQuery'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CueFxTable } from '@/components/cues/CueFxTable'
import { InlineTextCell } from '@/components/cues/InlineTextCell'
import { InlineEditCell, parseMs } from '@/components/cues/InlineEditCell'
import { buildCueInput, formatFadeText } from '@/lib/cueUtils'
import { usePatchProjectCueMutation } from '@/store/cues'
import type { Cue } from '@/api/cuesApi'
import type { CueStackCueEntry } from '@/api/cueStacksApi'
import type { FxPreset } from '@/api/fxPresetsApi'
import type { EffectLibraryEntry } from '@/store/fixtureFx'

interface ProgramCueRowProps {
  cue: CueStackCueEntry
  fullCue?: Cue
  projectId: number
  presets?: FxPreset[]
  library?: EffectLibraryEntry[]
  /** Cue is currently on stage — rendered with the green "live" accent. */
  isActive?: boolean
  /** Cue will fire on the next GO — rendered with the blue "next" accent. */
  isStandby?: boolean
  onOpenCueEditor: () => void
  /** Whether this cue is currently shown in the inline edit panel. */
  isEditing?: boolean
}

export function ProgramCueRow({
  cue,
  fullCue,
  projectId,
  presets,
  library,
  isActive = false,
  isStandby = false,
  onOpenCueEditor,
  isEditing = false,
}: ProgramCueRowProps) {
  const isWide = useMediaQuery(SM_BREAKPOINT)
  const stopProp = isWide ? (e: React.MouseEvent) => e.stopPropagation() : undefined
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

  const fadeText = formatFadeText(cue.fadeDurationMs, cue.fadeCurve)

  const nameColorClass = cn(
    'text-sm font-medium',
    isActive
      ? 'text-green-300 font-semibold'
      : isStandby
        ? 'text-blue-300 font-semibold'
        : 'text-foreground',
  )

  // ── Inline editing ──
  // All inline edits use PATCH — only the changed fields are sent, avoiding race
  // conditions where a stale snapshot overwrites a concurrent edit.
  const [patchCue] = usePatchProjectCueMutation()

  const handleInlineTimingChange = useCallback(
    (variant: 'presets' | 'effects' | 'triggers', itemIndex: number, field: string, value: number | null) => {
      if (!fullCue) return

      if (variant === 'presets') {
        const arr = buildCueInput(fullCue).presetApplications
        if (!arr[itemIndex]) return
        const pa = arr[itemIndex]
        if (field === 'delayMs') pa.delayMs = value
        else if (field === 'intervalMs') pa.intervalMs = value
        else if (field === 'randomWindowMs') pa.randomWindowMs = value
        patchCue({ projectId, cueId: cue.id, presetApplications: arr })
      } else if (variant === 'effects') {
        const arr = buildCueInput(fullCue).adHocEffects
        if (!arr[itemIndex]) return
        const eff = arr[itemIndex]
        if (field === 'delayMs') eff.delayMs = value
        else if (field === 'intervalMs') eff.intervalMs = value
        else if (field === 'randomWindowMs') eff.randomWindowMs = value
        else if (field === 'beatDivision' && value != null) eff.beatDivision = value
        patchCue({ projectId, cueId: cue.id, adHocEffects: arr })
      } else if (variant === 'triggers') {
        const arr = buildCueInput(fullCue).triggers
        if (!arr?.[itemIndex]) return
        const t = arr[itemIndex]
        if (field === 'delayMs') t.delayMs = value
        else if (field === 'intervalMs') t.intervalMs = value
        else if (field === 'randomWindowMs') t.randomWindowMs = value
        patchCue({ projectId, cueId: cue.id, triggers: arr })
      }
    },
    [fullCue, cue.id, projectId, patchCue],
  )

  const handleInlineRemove = useCallback(
    (variant: 'presets' | 'effects' | 'triggers', itemIndex: number) => {
      if (!fullCue) return

      if (variant === 'presets') {
        const arr = buildCueInput(fullCue).presetApplications
        arr.splice(itemIndex, 1)
        patchCue({ projectId, cueId: cue.id, presetApplications: arr })
      } else if (variant === 'effects') {
        const arr = buildCueInput(fullCue).adHocEffects
        arr.splice(itemIndex, 1)
        patchCue({ projectId, cueId: cue.id, adHocEffects: arr })
      } else if (variant === 'triggers') {
        const arr = buildCueInput(fullCue).triggers
        arr?.splice(itemIndex, 1)
        patchCue({ projectId, cueId: cue.id, triggers: arr })
      }
    },
    [fullCue, cue.id, projectId, patchCue],
  )

  const handleCueNumberChange = useCallback(
    (value: string | null) => {
      patchCue({ projectId, cueId: cue.id, cueNumber: value })
    },
    [patchCue, projectId, cue.id],
  )

  const handleNameChange = useCallback(
    (value: string | null) => {
      patchCue({ projectId, cueId: cue.id, name: value || fullCue?.name || '' })
    },
    [patchCue, projectId, cue.id, fullCue?.name],
  )

  const handleFadeChange = useCallback(
    (value: number | null) => {
      patchCue({ projectId, cueId: cue.id, fadeDurationMs: value })
    },
    [patchCue, projectId, cue.id],
  )

  return (
    <div ref={setNodeRef} style={sortableStyle} {...attributes} data-cue-row={cue.id}>
      <div
        className={cn(
          'flex items-center h-10 px-4 border-b border-l-[3px] border-l-transparent cursor-pointer transition-colors hover:bg-muted/50',
          expanded && 'bg-muted/10',
          isActive && 'border-l-green-500 bg-green-500/[0.08]',
          isStandby && !isActive && 'border-l-blue-500 bg-blue-500/[0.06]',
        )}
        onClick={() => isWide ? setExpanded(!expanded) : onOpenCueEditor()}
      >
        {/* Drag handle */}
        <div
          className="w-8 px-2 shrink-0 flex items-center text-muted-foreground hover:text-foreground cursor-grab"
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="size-4" />
        </div>

        {/* Expand/collapse chevron */}
        {isWide && (
          <div className="w-8 shrink-0 flex items-center justify-center">
            {expanded ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )}
          </div>
        )}

        {/* Q number */}
        <div className="w-14 px-2 shrink-0" onClick={stopProp}>
          {fullCue && isWide ? (
            <InlineTextCell
              value={cue.cueNumber}
              onChange={handleCueNumberChange}
              prefix="Q"
              placeholder="—"
              className="font-mono text-xs text-muted-foreground"
            />
          ) : (
            <span className="font-mono text-xs text-muted-foreground">
              {cue.cueNumber ? `Q${cue.cueNumber}` : '\u2014'}
            </span>
          )}
        </div>

        {/* Name (with live/next indicator) */}
        <div className="flex-1 px-2 min-w-0 flex items-center gap-1.5">
          {isActive ? (
            <Play className="size-3 fill-green-400 text-green-400 shrink-0" />
          ) : isStandby ? (
            <Circle className="size-3 fill-blue-500 text-blue-500 shrink-0" />
          ) : null}
          <div className="min-w-0 flex-1" onClick={stopProp}>
            {fullCue && isWide ? (
              <InlineTextCell
                value={cue.name}
                onChange={handleNameChange}
                placeholder="Untitled"
                className={nameColorClass}
              />
            ) : (
              <span className={cn(nameColorClass, 'truncate')}>
                {cue.name}
              </span>
            )}
          </div>
        </div>

        {/* Fade */}
        {isWide && (
          <div className="w-24 px-2 shrink-0 text-right" onClick={(e) => e.stopPropagation()}>
            {fullCue ? (
              <InlineEditCell
                value={cue.fadeDurationMs}
                onChange={handleFadeChange}
                format={(ms) => formatFadeText(ms, cue.fadeCurve)}
                parse={parseMs}
                placeholder="SNAP"
                inputPlaceholder="3s, 500ms"
                className="w-full text-right font-mono text-xs text-muted-foreground"
              />
            ) : (
              <span className="font-mono text-xs text-muted-foreground">{fadeText}</span>
            )}
          </div>
        )}

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
        {isWide && (
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
        )}

        {/* Edit sheet button */}
        {isWide && (
          <button
            className={cn(
              'size-8 flex items-center justify-center shrink-0 rounded transition-colors',
              isEditing
                ? 'text-primary bg-primary/15'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={(e) => {
              e.stopPropagation()
              onOpenCueEditor()
            }}
            title="Edit cue"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>

      {/* Expanded FX detail */}
      {isWide && expanded && hasExpandableContent && fullCue && (
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

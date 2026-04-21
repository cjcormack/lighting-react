import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SheetTitle } from '@/components/ui/sheet'
import { Check, Eye, EyeOff, Globe, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CuePaletteEditor } from '../CuePaletteEditor'
import type { CueEditMode } from '@/api/cueEditWsApi'

export interface CueEditorHeaderProps {
  isEditing: boolean
  /** 'sheet' uses `SheetTitle` (required for Radix a11y); 'inline' uses a plain `h3`. */
  mode: 'sheet' | 'inline'

  name: string
  onNameChange: (value: string) => void

  palette: string[]
  onPaletteChange: (palette: string[]) => void
  inheritedPalette?: string[]

  updateGlobalPalette: boolean
  onUpdateGlobalPaletteChange: (value: boolean) => void

  editMode: CueEditMode
  onEditModeChange: (mode: CueEditMode) => void

  isInStack: boolean
  cueNumber: string
  onCueNumberChange: (value: string) => void
  notes: string
  onNotesChange: (value: string) => void
  autoAdvance: boolean
  onAutoAdvanceChange: (value: boolean) => void
  autoAdvanceDelayMs: string
  onAutoAdvanceDelayMsChange: (value: string) => void
  fadeDurationMs: string
  onFadeDurationMsChange: (value: string) => void
  fadeCurve: string
  onFadeCurveChange: (value: string) => void

  error: string | null
}

/** Metadata + palette + Live/Blind toggle for the CueEditor. */
export function CueEditorHeader(props: CueEditorHeaderProps) {
  const {
    isEditing,
    mode,
    name,
    onNameChange,
    palette,
    onPaletteChange,
    inheritedPalette,
    updateGlobalPalette,
    onUpdateGlobalPaletteChange,
    editMode,
    onEditModeChange,
    isInStack,
    cueNumber,
    onCueNumberChange,
    notes,
    onNotesChange,
    autoAdvance,
    onAutoAdvanceChange,
    autoAdvanceDelayMs,
    onAutoAdvanceDelayMsChange,
    fadeDurationMs,
    onFadeDurationMsChange,
    fadeCurve,
    onFadeCurveChange,
    error,
  } = props

  const toggleEditMode = useCallback(() => {
    onEditModeChange(editMode === 'live' ? 'blind' : 'live')
  }, [editMode, onEditModeChange])

  const title = isEditing ? 'Edit FX Cue' : 'New FX Cue'

  return (
    <div className="space-y-3">
      <div className={cn('flex items-center justify-between gap-3', mode === 'sheet' ? 'pr-8' : '')}>
        <div className="min-w-0 flex-1">
          {mode === 'inline' ? (
            <h3 className="text-foreground font-semibold truncate">{title}</h3>
          ) : (
            <SheetTitle className="text-lg truncate">{title}</SheetTitle>
          )}
        </div>
        <LiveBlindToggle mode={editMode} onToggle={toggleEditMode} />
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      <div className="space-y-1.5">
        <Label htmlFor="cue-name">Name *</Label>
        <Input
          id="cue-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="My FX Cue"
          className="h-9"
          autoFocus={!isEditing}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <Palette className="size-3.5" />
          Palette
          {palette.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
              {palette.length}
            </Badge>
          )}
        </Label>
        <CuePaletteEditor
          palette={palette}
          onChange={onPaletteChange}
          inheritedPalette={inheritedPalette}
        />
        {palette.length > 0 && (
          <button
            type="button"
            className="flex items-center gap-2 mt-2 px-1 w-full text-left"
            onClick={() => onUpdateGlobalPaletteChange(!updateGlobalPalette)}
          >
            <div
              className={cn(
                'size-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                updateGlobalPalette
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-muted-foreground/40',
              )}
            >
              {updateGlobalPalette && <Check className="size-3" />}
            </div>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Globe className="size-3" />
              Update global palette on apply
            </span>
          </button>
        )}
      </div>

      {isInStack && (
        <div className="space-y-3 pt-2 border-t">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Cue Properties
          </Label>
          <div className="space-y-1.5">
            <Label htmlFor="cue-number">Cue Number</Label>
            <Input
              id="cue-number"
              value={cueNumber}
              onChange={(e) => onCueNumberChange(e.target.value)}
              placeholder="e.g. 14A"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cue-notes">Notes</Label>
            <Textarea
              id="cue-notes"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Script note or reference..."
              className="min-h-[60px] resize-y"
            />
          </div>
        </div>
      )}

      {isInStack && (
        <div className="space-y-3 pt-2 border-t">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Transition
          </Label>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-advance</Label>
                <p className="text-xs text-muted-foreground">Advance to next cue after delay</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoAdvance}
                onClick={() => onAutoAdvanceChange(!autoAdvance)}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                  autoAdvance ? 'bg-primary' : 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block size-5 rounded-full bg-background shadow-lg transition-transform',
                    autoAdvance ? 'translate-x-5' : 'translate-x-0',
                  )}
                />
              </button>
            </div>
            {autoAdvance && (
              <div className="space-y-1.5 pl-1">
                <Label htmlFor="cue-auto-advance-delay">Delay (ms)</Label>
                <Input
                  id="cue-auto-advance-delay"
                  type="number"
                  min="100"
                  step="100"
                  value={autoAdvanceDelayMs}
                  onChange={(e) => onAutoAdvanceDelayMsChange(e.target.value)}
                  placeholder="e.g. 5000"
                  className="h-9"
                />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Crossfade</Label>
            <p className="text-xs text-muted-foreground">
              Fade in from previous cue. Leave empty for snap-cut.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="cue-fade-duration" className="text-xs">
                  Duration (ms)
                </Label>
                <Input
                  id="cue-fade-duration"
                  type="number"
                  min="0"
                  step="100"
                  value={fadeDurationMs}
                  onChange={(e) => onFadeDurationMsChange(e.target.value)}
                  placeholder="e.g. 2000"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Easing curve</Label>
                <Select value={fadeCurve} onValueChange={onFadeCurveChange}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LINEAR">Linear</SelectItem>
                    <SelectItem value="SINE_IN_OUT">Sine In/Out</SelectItem>
                    <SelectItem value="CUBIC_IN_OUT">Cubic In/Out</SelectItem>
                    <SelectItem value="EASE_IN">Ease In</SelectItem>
                    <SelectItem value="EASE_OUT">Ease Out</SelectItem>
                    <SelectItem value="EASE_IN_OUT">Ease In/Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LiveBlindToggle({ mode, onToggle }: { mode: CueEditMode; onToggle: () => void }) {
  const isLive = mode === 'live'
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onToggle}
      className={cn(
        'shrink-0 gap-1.5',
        isLive
          ? 'border-primary text-primary hover:text-primary'
          : 'border-amber-500 text-amber-600 dark:text-amber-400 hover:text-amber-600 bg-amber-50 dark:bg-amber-950/30',
      )}
      aria-pressed={!isLive}
      title={
        isLive
          ? 'Live — edits apply to the stage'
          : 'Blind — edits persist to the cue only; stage untouched'
      }
    >
      {isLive ? (
        <>
          <Eye className="size-3.5" />
          Live
        </>
      ) : (
        <>
          <EyeOff className="size-3.5" />
          Blind
        </>
      )}
    </Button>
  )
}

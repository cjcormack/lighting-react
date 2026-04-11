import { useState, useEffect, useCallback, useRef } from 'react'
import { Pencil, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { CueStackCueEntry } from '@/api/cueStacksApi'

interface EditorPanelProps {
  open: boolean
  cue: CueStackCueEntry | null
  isActiveCue: boolean
  onToggle: () => void
  onFieldChange: (cueId: number, field: string, value: unknown) => void
}

export function EditorPanel({
  open,
  cue,
  isActiveCue,
  onToggle,
  onFieldChange,
}: EditorPanelProps) {
  return (
    <div
      className={cn(
        'shrink-0 bg-card border-l flex overflow-hidden transition-[width] duration-200',
        open ? 'w-[300px]' : 'w-[50px]',
      )}
    >
      {/* Icon strip */}
      <div className="w-[50px] min-w-[50px] shrink-0 flex flex-col items-center pt-2.5 gap-1.5 border-r">
        <button
          onClick={onToggle}
          className={cn(
            'w-[34px] h-[34px] flex items-center justify-center rounded border border-transparent text-muted-foreground/30 transition-colors hover:text-muted-foreground/60 hover:bg-muted/30 hover:border-border',
            open && 'text-blue-500 bg-blue-500/10 border-blue-500/20',
          )}
          title={open ? 'Close editor' : 'Open editor'}
        >
          {open ? <X className="size-4" /> : <Pencil className="size-4" />}
        </button>
      </div>

      {/* Editor content */}
      {open && (
        <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-3 min-w-0">
          {!cue ? (
            <div className="text-muted-foreground/20 text-[11px] mt-6 text-center tracking-wider leading-relaxed uppercase font-semibold">
              Click a cue
              <br />
              to edit
            </div>
          ) : (
            <EditorContent
              cue={cue}
              isActiveCue={isActiveCue}
              onFieldChange={onFieldChange}
            />
          )}
        </div>
      )}
    </div>
  )
}

function EditorContent({
  cue,
  isActiveCue,
  onFieldChange,
}: {
  cue: CueStackCueEntry
  isActiveCue: boolean
  onFieldChange: (cueId: number, field: string, value: unknown) => void
}) {
  const debouncedChange = useDebouncedFieldChange(cue.id, onFieldChange)

  return (
    <>
      {/* Cue header */}
      <div>
        <div className="text-[9px] font-bold tracking-[0.14em] uppercase text-muted-foreground/30">
          Editing Cue
        </div>
        <div className="text-[15px] font-semibold text-muted-foreground/60 truncate mt-0.5">
          {cue.name}
        </div>
        {cue.cueNumber && (
          <div className="font-mono text-[11px] text-muted-foreground/35 mt-0.5">
            Q{cue.cueNumber}
          </div>
        )}
      </div>

      {isActiveCue && (
        <div className="flex items-center gap-1.5 p-2 rounded bg-amber-500/[0.08] border border-amber-500/20 text-[11px] text-amber-600 dark:text-amber-500/70 font-semibold tracking-wider">
          {'\u25B6'} Currently fading
        </div>
      )}

      <div className="h-px bg-border/30" />

      {/* Cue Number */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-[9px] font-bold tracking-[0.12em] uppercase text-muted-foreground/30">
          Cue Number
        </Label>
        <DebouncedInput
          key={cue.id}
          defaultValue={cue.cueNumber ?? ''}
          placeholder="e.g. 14A"
          onChange={(val) => debouncedChange('cueNumber', val || null)}
          className="font-mono text-xs"
        />
      </div>

      {/* Fade Duration */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-[9px] font-bold tracking-[0.12em] uppercase text-muted-foreground/30">
          Fade Duration (ms)
        </Label>
        <DebouncedInput
          key={cue.id}
          type="number"
          defaultValue={String(cue.fadeDurationMs ?? 0)}
          onChange={(val) => debouncedChange('fadeDurationMs', parseInt(val) || 0)}
          className="font-mono text-xs"
          min={0}
          step={100}
        />
      </div>

      {/* Fade Curve */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-[9px] font-bold tracking-[0.12em] uppercase text-muted-foreground/30">
          Fade Curve
        </Label>
        <Select
          value={cue.fadeCurve ?? 'LINEAR'}
          onValueChange={(val) => onFieldChange(cue.id, 'fadeCurve', val)}
        >
          <SelectTrigger size="sm" className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LINEAR">Linear</SelectItem>
            <SelectItem value="EASE_IN_OUT">Ease In/Out (Sine)</SelectItem>
            <SelectItem value="SINE_IN_OUT">Sine In/Out</SelectItem>
            <SelectItem value="CUBIC_IN_OUT">Cubic In/Out</SelectItem>
            <SelectItem value="EASE_IN">Ease In</SelectItem>
            <SelectItem value="EASE_OUT">Ease Out</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Auto-advance */}
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={cue.autoAdvance}
            onChange={(e) => onFieldChange(cue.id, 'autoAdvance', e.target.checked)}
            className="accent-blue-500 size-3.5 cursor-pointer"
          />
          <span className="text-[13px] text-blue-500/70 cursor-pointer">Auto-advance</span>
        </label>
        {cue.autoAdvance && (
          <>
            <Label className="text-[9px] font-bold tracking-[0.12em] uppercase text-muted-foreground/30 mt-1">
              Delay after fade (ms)
            </Label>
            <DebouncedInput
              key={`${cue.id}-delay`}
              type="number"
              defaultValue={String(cue.autoAdvanceDelayMs ?? 0)}
              onChange={(val) => debouncedChange('autoAdvanceDelayMs', parseInt(val) || 0)}
              className="font-mono text-xs"
              min={0}
              step={100}
            />
          </>
        )}
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-[9px] font-bold tracking-[0.12em] uppercase text-muted-foreground/30">
          Notes
        </Label>
        <DebouncedTextarea
          key={cue.id}
          defaultValue={cue.notes ?? ''}
          placeholder="Script note or reference..."
          onChange={(val) => debouncedChange('notes', val || null)}
          className="text-[13px] min-h-14 resize-y"
        />
      </div>
    </>
  )
}

function useDebouncedFieldChange(
  cueId: number,
  onFieldChange: (cueId: number, field: string, value: unknown) => void,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debouncedChange = useCallback(
    (field: string, value: unknown) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        onFieldChange(cueId, field, value)
      }, 300)
    },
    [cueId, onFieldChange],
  )

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return debouncedChange
}

function DebouncedInput({
  defaultValue,
  onChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value'> & {
  defaultValue: string
  onChange: (value: string) => void
}) {
  const [value, setValue] = useState(defaultValue)

  return (
    <Input
      {...props}
      value={value}
      onChange={(e) => {
        setValue(e.target.value)
        onChange(e.target.value)
      }}
    />
  )
}

function DebouncedTextarea({
  defaultValue,
  onChange,
  ...props
}: Omit<React.ComponentProps<typeof Textarea>, 'onChange' | 'value'> & {
  defaultValue: string
  onChange: (value: string) => void
}) {
  const [value, setValue] = useState(defaultValue)

  return (
    <Textarea
      {...props}
      value={value}
      onChange={(e) => {
        setValue(e.target.value)
        onChange(e.target.value)
      }}
    />
  )
}

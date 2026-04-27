import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Palette, Plus, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { CuePaletteEditor } from '@/components/cues/CuePaletteEditor'
import { CueTriggerEditor } from '@/components/cues/CueTriggerEditor'
import { TriggerSummary } from '@/components/cues/TriggerSummary'
import {
  usePatchProjectCueMutation,
  useSaveProjectCueMutation,
} from '@/store/cues'
import { buildCueInput } from '@/lib/cueUtils'
import type { Cue, CueTrigger, CueTriggerDetail } from '@/api/cuesApi'

interface CuePropsPaneProps {
  cue: Cue
  projectId: number
}

/**
 * Properties pane: name, cue#, fade in/out, easing, palette, notes,
 * auto-advance, script hooks. Every field is auto-saved via PATCH on commit
 * (input blur / change for text+selects, change for toggles).
 *
 * Local state mirrors the cue while typing so we can dispatch one PATCH on
 * blur instead of a PATCH per keystroke; the displayed value still reflects
 * the live `cue` prop after save resolves.
 */
export function CuePropsPane({ cue, projectId }: CuePropsPaneProps) {
  const [patchCue] = usePatchProjectCueMutation()
  const [saveCue] = useSaveProjectCueMutation()

  const [name, setName] = useState(cue.name)
  const [cueNumber, setCueNumber] = useState(cue.cueNumber ?? '')
  const [notes, setNotes] = useState(cue.notes ?? '')
  const [fadeMs, setFadeMs] = useState(
    cue.fadeDurationMs != null ? String(cue.fadeDurationMs) : '',
  )
  const [autoAdvanceDelay, setAutoAdvanceDelay] = useState(
    cue.autoAdvanceDelayMs != null ? String(cue.autoAdvanceDelayMs) : '',
  )

  // Re-sync only when the cue identity changes — keying on every field would
  // clobber in-flight typing whenever a refetch lands mid-keystroke.
  useEffect(() => {
    setName(cue.name)
    setCueNumber(cue.cueNumber ?? '')
    setNotes(cue.notes ?? '')
    setFadeMs(cue.fadeDurationMs != null ? String(cue.fadeDurationMs) : '')
    setAutoAdvanceDelay(cue.autoAdvanceDelayMs != null ? String(cue.autoAdvanceDelayMs) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue.id])

  const commitName = useCallback(() => {
    const trimmed = name.trim()
    if (trimmed === '' || trimmed === cue.name) return
    patchCue({ projectId, cueId: cue.id, name: trimmed })
  }, [name, cue.id, cue.name, patchCue, projectId])

  const commitCueNumber = useCallback(() => {
    const next = cueNumber.trim() || null
    if (next === (cue.cueNumber ?? null)) return
    patchCue({ projectId, cueId: cue.id, cueNumber: next })
  }, [cueNumber, cue.cueNumber, cue.id, patchCue, projectId])

  const commitNotes = useCallback(() => {
    const next = notes.trim() || null
    if (next === (cue.notes ?? null)) return
    patchCue({ projectId, cueId: cue.id, notes: next })
  }, [notes, cue.notes, cue.id, patchCue, projectId])

  const commitFade = useCallback(() => {
    const raw = fadeMs.trim()
    const next = raw === '' ? null : Number(raw)
    if (raw !== '' && !Number.isFinite(next)) return
    if (next === (cue.fadeDurationMs ?? null)) return
    patchCue({ projectId, cueId: cue.id, fadeDurationMs: next as number | null })
  }, [fadeMs, cue.fadeDurationMs, cue.id, patchCue, projectId])

  const commitAutoAdvanceDelay = useCallback(() => {
    const raw = autoAdvanceDelay.trim()
    const next = raw === '' ? null : Number(raw)
    if (raw !== '' && !Number.isFinite(next)) return
    if (next === (cue.autoAdvanceDelayMs ?? null)) return
    patchCue({ projectId, cueId: cue.id, autoAdvanceDelayMs: next as number | null })
  }, [autoAdvanceDelay, cue.autoAdvanceDelayMs, cue.id, patchCue, projectId])

  const setFadeCurve = useCallback(
    (curve: string) => {
      if (curve === cue.fadeCurve) return
      patchCue({ projectId, cueId: cue.id, fadeCurve: curve })
    },
    [cue.fadeCurve, cue.id, patchCue, projectId],
  )

  const setAutoAdvance = useCallback(
    (next: boolean) => {
      if (next === cue.autoAdvance) return
      patchCue({ projectId, cueId: cue.id, autoAdvance: next })
    },
    [cue.autoAdvance, cue.id, patchCue, projectId],
  )

  const setPalette = useCallback(
    (next: string[]) => {
      // CuePatchInput excludes palette (so PATCH callers can't accidentally blank it),
      // so palette edits must round-trip through PUT.
      const input = buildCueInput(cue)
      input.palette = next
      saveCue({ projectId, cueId: cue.id, ...input })
    },
    [cue, saveCue, projectId],
  )

  const [hooksExpanded, setHooksExpanded] = useState((cue.triggers ?? []).length > 0)
  const [editingHook, setEditingHook] = useState<
    { kind: 'add' } | { kind: 'edit'; index: number } | null
  >(null)

  const writeTriggers = useCallback(
    (next: CueTrigger[]) => {
      patchCue({ projectId, cueId: cue.id, triggers: next })
    },
    [cue.id, patchCue, projectId],
  )

  const handleHookConfirm = (t: CueTrigger) => {
    if (editingHook?.kind === 'add') {
      writeTriggers([
        ...cue.triggers.map(stripScriptName),
        t,
      ])
    } else if (editingHook?.kind === 'edit') {
      const updated = cue.triggers.map(stripScriptName)
      updated[editingHook.index] = t
      writeTriggers(updated)
    }
    setEditingHook(null)
  }

  const handleHookRemove = () => {
    if (editingHook?.kind !== 'edit') return
    const filtered = cue.triggers
      .map(stripScriptName)
      .filter((_, i) => i !== editingHook.index)
    writeTriggers(filtered)
    setEditingHook(null)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`cue-${cue.id}-name`}>Name</Label>
        <Input
          id={`cue-${cue.id}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          className="h-9"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`cue-${cue.id}-num`}>Cue #</Label>
          <Input
            id={`cue-${cue.id}-num`}
            value={cueNumber}
            onChange={(e) => setCueNumber(e.target.value)}
            onBlur={commitCueNumber}
            placeholder="14A"
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Easing</Label>
          <Select value={cue.fadeCurve} onValueChange={setFadeCurve}>
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

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <Palette className="size-3.5" />
          Palette
          {cue.palette.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
              {cue.palette.length}
            </Badge>
          )}
        </Label>
        <CuePaletteEditor palette={cue.palette} onChange={setPalette} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`cue-${cue.id}-notes`}>Notes</Label>
        <Textarea
          id={`cue-${cue.id}-notes`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={commitNotes}
          placeholder="Performance note…"
          className="min-h-[60px] resize-y"
        />
      </div>

      <div className="border-t pt-3 space-y-3">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Transition
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`cue-${cue.id}-fade`}>Fade duration (ms)</Label>
            <Input
              id={`cue-${cue.id}-fade`}
              type="number"
              min="0"
              step="100"
              value={fadeMs}
              onChange={(e) => setFadeMs(e.target.value)}
              onBlur={commitFade}
              placeholder="2000"
              className="h-9 font-mono"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="cursor-pointer" htmlFor={`cue-${cue.id}-auto`}>
              Auto-advance
            </Label>
            <p className="text-xs text-muted-foreground">
              Advance to next cue after delay
            </p>
          </div>
          <button
            id={`cue-${cue.id}-auto`}
            type="button"
            role="switch"
            aria-checked={cue.autoAdvance}
            onClick={() => setAutoAdvance(!cue.autoAdvance)}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
              cue.autoAdvance ? 'bg-primary' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block size-5 rounded-full bg-background shadow-lg transition-transform',
                cue.autoAdvance ? 'translate-x-5' : 'translate-x-0',
              )}
            />
          </button>
        </div>

        {cue.autoAdvance && (
          <div className="space-y-1.5 pl-1">
            <Label htmlFor={`cue-${cue.id}-auto-delay`}>Delay (ms)</Label>
            <Input
              id={`cue-${cue.id}-auto-delay`}
              type="number"
              min="100"
              step="100"
              value={autoAdvanceDelay}
              onChange={(e) => setAutoAdvanceDelay(e.target.value)}
              onBlur={commitAutoAdvanceDelay}
              placeholder="5000"
              className="h-9 font-mono"
            />
          </div>
        )}
      </div>

      {/* Script hooks */}
      <div className="border-t pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="flex items-center gap-2 text-left"
            onClick={() => setHooksExpanded((v) => !v)}
          >
            <ChevronDown
              className={cn(
                'size-3.5 transition-transform',
                !hooksExpanded && '-rotate-90',
              )}
            />
            <Label className="flex items-center gap-1.5 cursor-pointer">
              <Zap className="size-3.5" />
              Script Hooks
              {cue.triggers.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                  {cue.triggers.length}
                </Badge>
              )}
            </Label>
          </button>
          {hooksExpanded && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setEditingHook({ kind: 'add' })}
            >
              <Plus className="size-3" />
              Add Hook
            </Button>
          )}
        </div>

        {hooksExpanded && (
          <div className="space-y-2">
            {cue.triggers.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                No script hooks. Hooks run FX Application scripts at cue lifecycle events.
              </p>
            )}
            {cue.triggers.map((trigger, index) => (
              <TriggerSummary
                key={`trigger-${index}`}
                trigger={trigger}
                onClick={() => setEditingHook({ kind: 'edit', index })}
                onRemove={() => {
                  writeTriggers(
                    cue.triggers
                      .map(stripScriptName)
                      .filter((_, i) => i !== index),
                  )
                }}
              />
            ))}
          </div>
        )}
      </div>

      <Sheet
        open={editingHook != null}
        onOpenChange={(open) => {
          if (!open) setEditingHook(null)
        }}
      >
        <SheetContent
          side="right"
          className="sm:max-w-lg flex flex-col p-0"
          aria-describedby={undefined}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Script hook</SheetTitle>
          </SheetHeader>
          {editingHook && (
            <CueTriggerEditor
              projectId={projectId}
              mode="sheet"
              trigger={
                editingHook.kind === 'edit'
                  ? cue.triggers[editingHook.index]
                  : null
              }
              onConfirm={handleHookConfirm}
              onCancel={() => setEditingHook(null)}
              onRemove={editingHook.kind === 'edit' ? handleHookRemove : undefined}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function stripScriptName(t: CueTriggerDetail): CueTrigger {
  const { scriptName: _scriptName, ...rest } = t
  return rest
}

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  Loader2,
  X,
  Palette,
  Bookmark,
  AudioWaveform,
  Eraser,
  Globe,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffectLibraryQuery } from '@/store/fixtureFx'
import { useProjectPresetListQuery } from '@/store/fxPresets'
import { EffectSummary } from '@/components/fx/EffectSummary'
import { PresetApplicationSummary } from '@/components/fx/PresetApplicationSummary'
import { fromPresetEffect, fromCueAdHocEffect } from '@/components/fx/effectSummaryTypes'
import { CuePaletteEditor } from './CuePaletteEditor'
import { CuePresetPicker } from './CuePresetPicker'
import { CueEffectFlow } from './CueEffectFlow'
import type { Cue, CueInput, CueAdHocEffect, CueCurrentState } from '@/api/cuesApi'

/** Which view is showing inside the Sheet */
type CueFormView =
  | 'main'
  | 'add-preset'
  | 'edit-preset'
  | 'add-effect'
  | 'edit-effect'

/** Local representation of a preset application (with resolved name for display) */
interface CuePresetAppLocal {
  presetId: number
  presetName: string | null
  targets: { type: 'group' | 'fixture'; key: string }[]
}

interface CueFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cue: Cue | null
  projectId: number
  onSave: (input: CueInput) => Promise<void>
  isSaving: boolean
  initialState?: CueCurrentState
  /** Whether the cue belongs to (or is being created in) a cue stack */
  isInStack?: boolean
  /** Palette inherited from previous cues in the stack (for display & picker context) */
  inheritedPalette?: string[]
}

export function CueForm({
  open,
  onOpenChange,
  cue,
  projectId,
  onSave,
  isSaving,
  initialState,
  isInStack = false,
  inheritedPalette,
}: CueFormProps) {
  const { data: library } = useEffectLibraryQuery()
  const { data: presets } = useProjectPresetListQuery(projectId)

  // ── Local editing state ──
  const [name, setName] = useState('')
  const [palette, setPalette] = useState<string[]>([])
  const [updateGlobalPalette, setUpdateGlobalPalette] = useState(false)
  const [presetApps, setPresetApps] = useState<CuePresetAppLocal[]>([])
  const [adHocEffects, setAdHocEffects] = useState<CueAdHocEffect[]>([])
  const [autoAdvance, setAutoAdvance] = useState(false)
  const [autoAdvanceDelayMs, setAutoAdvanceDelayMs] = useState<string>('')
  const [fadeDurationMs, setFadeDurationMs] = useState<string>('')
  const [fadeCurve, setFadeCurve] = useState('LINEAR')
  const [error, setError] = useState<string | null>(null)

  // Current view inside the sheet
  const [view, setView] = useState<CueFormView>('main')

  // Index of the preset application being edited
  const [editingPresetIndex, setEditingPresetIndex] = useState<number | null>(null)

  // Index of the effect being edited
  const [editingEffectIndex, setEditingEffectIndex] = useState<number | null>(null)

  const isEditing = cue !== null

  // Effective palette for pickers: use own palette if non-empty, otherwise fall back to inherited
  const effectivePalette = palette.length > 0 ? palette : (inheritedPalette ?? [])

  // ── Reset form when sheet opens ──
  useEffect(() => {
    if (open) {
      // When editing an existing cue, populate from it; when creating, use initialState if available
      const source = cue ?? initialState
      setName(cue?.name ?? '')
      setPalette(source?.palette ?? [])
      setUpdateGlobalPalette(cue?.updateGlobalPalette ?? false)
      setPresetApps(
        source?.presetApplications.map((pa) => ({
          presetId: pa.presetId,
          presetName: pa.presetName,
          targets: pa.targets,
        })) ?? [],
      )
      setAdHocEffects(source?.adHocEffects ?? [])
      setAutoAdvance(cue?.autoAdvance ?? false)
      setAutoAdvanceDelayMs(cue?.autoAdvanceDelayMs != null ? String(cue.autoAdvanceDelayMs) : '')
      setFadeDurationMs(cue?.fadeDurationMs != null ? String(cue.fadeDurationMs) : '')
      setFadeCurve(cue?.fadeCurve ?? 'LINEAR')
      setError(null)
      setView('main')
      setEditingPresetIndex(null)
      setEditingEffectIndex(null)
    }
  }, [open, cue, initialState])

  // ── Save handler ──
  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }

    try {
      await onSave({
        name: name.trim(),
        palette,
        updateGlobalPalette,
        presetApplications: presetApps.map((pa) => ({
          presetId: pa.presetId,
          targets: pa.targets,
        })),
        adHocEffects,
        autoAdvance,
        autoAdvanceDelayMs: autoAdvanceDelayMs ? Number(autoAdvanceDelayMs) : null,
        fadeDurationMs: fadeDurationMs ? Number(fadeDurationMs) : null,
        fadeCurve,
      })
      onOpenChange(false)
    } catch (e) {
      if (e && typeof e === 'object' && 'status' in e && e.status === 409) {
        setError('A cue with this name already exists')
      } else {
        setError('Failed to save cue')
      }
    }
  }

  // ── Preset handlers ──
  const handleAddPreset = () => {
    setEditingPresetIndex(null)
    setView('add-preset')
  }

  const handleEditPreset = (index: number) => {
    setEditingPresetIndex(index)
    setView('edit-preset')
  }

  const handlePresetConfirm = (app: { presetId: number; presetName: string; targets: { type: 'group' | 'fixture'; key: string }[] }) => {
    setPresetApps([...presetApps, {
      presetId: app.presetId,
      presetName: app.presetName,
      targets: app.targets,
    }])
    setView('main')
  }

  const handlePresetEditConfirm = (app: { presetId: number; presetName: string; targets: { type: 'group' | 'fixture'; key: string }[] }) => {
    if (editingPresetIndex === null) return
    const next = [...presetApps]
    next[editingPresetIndex] = {
      presetId: app.presetId,
      presetName: app.presetName,
      targets: app.targets,
    }
    setPresetApps(next)
    setView('main')
  }

  const handleRemovePreset = (index: number) => {
    setPresetApps(presetApps.filter((_, i) => i !== index))
    if (editingPresetIndex === index) {
      setEditingPresetIndex(null)
      setView('main')
    }
  }

  // ── Effect handlers ──
  const handleAddEffect = () => {
    setEditingEffectIndex(null)
    setView('add-effect')
  }

  const handleEditEffect = (index: number) => {
    setEditingEffectIndex(index)
    setView('edit-effect')
  }

  const handleEffectConfirm = (effects: CueAdHocEffect[]) => {
    setAdHocEffects([...adHocEffects, ...effects])
    setView('main')
  }

  const handleEffectUpdate = (updated: CueAdHocEffect) => {
    if (editingEffectIndex === null) return
    const next = [...adHocEffects]
    next[editingEffectIndex] = updated
    setAdHocEffects(next)
    setView('main')
  }

  const handleEffectRemove = () => {
    if (editingEffectIndex === null) return
    setAdHocEffects(adHocEffects.filter((_, i) => i !== editingEffectIndex))
    setEditingEffectIndex(null)
    setView('main')
  }

  // ── Close blocking: sub-views go back to main, not close ──
  const handleSheetOpenChange = useCallback(
    (value: boolean) => {
      if (!value && view !== 'main') {
        setView('main')
        return
      }
      onOpenChange(value)
    },
    [onOpenChange, view],
  )

  const isValid = name.trim().length > 0

  return (
    <Sheet open={open} onOpenChange={handleSheetOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col overflow-hidden"
      >
        {/* ═══════ Main form view ═══════ */}
        {view === 'main' && (
          <>
            <SheetHeader className="pr-10">
              <div className="flex items-center justify-between">
                <SheetTitle>{isEditing ? 'Edit FX Cue' : 'New FX Cue'}</SheetTitle>
                {!isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-muted-foreground"
                    disabled={name === '' && palette.length === 0 && presetApps.length === 0 && adHocEffects.length === 0}
                    onClick={() => {
                      setName('')
                      setPalette([])
                      setUpdateGlobalPalette(false)
                      setPresetApps([])
                      setAdHocEffects([])
                      setError(null)
                    }}
                  >
                    <Eraser className="size-3.5" />
                    Clear
                  </Button>
                )}
              </div>
              <SheetDescription>
                {isEditing
                  ? 'Update the FX cue name, palette, presets, and effects.'
                  : 'Create a new FX cue with a palette, presets, and ad-hoc effects.'}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto space-y-4 py-4">

              {/* Error message */}
              {error && (
                <div className="px-1 text-sm text-destructive">{error}</div>
              )}

              {/* Name */}
              <div className="space-y-1.5 px-1">
                <Label htmlFor="cue-name">Name *</Label>
                <Input
                  id="cue-name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(null) }}
                  placeholder="My FX Cue"
                  className="h-9"
                  autoFocus
                />
              </div>

              {/* ── Palette (inline editor) ── */}
              <div className="space-y-1.5 px-1">
                <Label className="flex items-center gap-1.5">
                  <Palette className="size-3.5" />
                  Palette
                  {palette.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                      {palette.length}
                    </Badge>
                  )}
                </Label>
                <CuePaletteEditor palette={palette} onChange={setPalette} inheritedPalette={inheritedPalette} />

                {palette.length > 0 && (
                  <button
                    type="button"
                    className="flex items-center gap-2 mt-2 px-1 w-full text-left"
                    onClick={() => setUpdateGlobalPalette(!updateGlobalPalette)}
                  >
                    <div className={cn(
                      'size-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                      updateGlobalPalette
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-muted-foreground/40',
                    )}>
                      {updateGlobalPalette && <Check className="size-3" />}
                    </div>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Globe className="size-3" />
                      Update global palette on apply
                    </span>
                  </button>
                )}
              </div>

              {/* ── Preset Applications ── */}
              <div className="space-y-1.5 px-1">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Bookmark className="size-3.5" />
                    Presets
                    {presetApps.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                        {presetApps.length}
                      </Badge>
                    )}
                  </Label>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAddPreset}>
                    <Plus className="size-3 mr-1" />
                    Add Preset
                  </Button>
                </div>

                {presetApps.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    No presets added. Presets apply saved FX configurations to targets.
                  </p>
                )}

                {presetApps.map((pa, index) => {
                  const fullPreset = presets?.find((p) => p.id === pa.presetId)
                  const presetEffects = fullPreset?.effects ?? []

                  return (
                    <PresetApplicationSummary
                      key={`preset-${index}`}
                      presetName={pa.presetName}
                      presetId={pa.presetId}
                      effects={presetEffects.map((e) => fromPresetEffect(e, library))}
                      targets={pa.targets}
                      palette={effectivePalette}
                      onClick={() => handleEditPreset(index)}
                      actions={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemovePreset(index)
                          }}
                        >
                          <X className="size-3.5" />
                        </Button>
                      }
                    />
                  )
                })}
              </div>

              {/* ── Ad-hoc Effects ── */}
              <div className="space-y-1.5 px-1">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <AudioWaveform className="size-3.5" />
                    Effects
                    {adHocEffects.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                        {adHocEffects.length}
                      </Badge>
                    )}
                  </Label>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAddEffect}>
                    <Plus className="size-3 mr-1" />
                    Add Effect
                  </Button>
                </div>

                {adHocEffects.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    No ad-hoc effects. These are inline effects not from a preset.
                  </p>
                )}

                {adHocEffects.map((effect, index) => (
                  <EffectSummary
                    key={`effect-${index}`}
                    effect={fromCueAdHocEffect(effect, library)}
                    target={{ type: effect.targetType, key: effect.targetKey }}
                    palette={effectivePalette}
                    onClick={() => handleEditEffect(index)}
                    actions={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          setAdHocEffects(adHocEffects.filter((_, i) => i !== index))
                        }}
                      >
                        <X className="size-3.5" />
                      </Button>
                    }
                  />
                ))}
              </div>

              {/* ── Stack Transition Settings (only for cues in a stack) ── */}
              {isInStack && (
                <div className="space-y-3 px-1 pt-2 border-t">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Transition
                  </Label>

                  {/* Auto-advance */}
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
                        onClick={() => setAutoAdvance(!autoAdvance)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                          autoAdvance ? 'bg-primary' : 'bg-muted'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block size-5 rounded-full bg-background shadow-lg transition-transform ${
                            autoAdvance ? 'translate-x-5' : 'translate-x-0'
                          }`}
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
                          onChange={(e) => setAutoAdvanceDelayMs(e.target.value)}
                          placeholder="e.g. 5000"
                          className="h-9"
                        />
                      </div>
                    )}
                  </div>

                  {/* Crossfade */}
                  <div className="space-y-2">
                    <Label>Crossfade</Label>
                    <p className="text-xs text-muted-foreground">
                      Fade in from previous cue. Leave empty for snap-cut.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="cue-fade-duration" className="text-xs">Duration (ms)</Label>
                        <Input
                          id="cue-fade-duration"
                          type="number"
                          min="0"
                          step="100"
                          value={fadeDurationMs}
                          onChange={(e) => setFadeDurationMs(e.target.value)}
                          placeholder="e.g. 2000"
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Easing curve</Label>
                        <Select value={fadeCurve} onValueChange={setFadeCurve}>
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

            <SheetFooter className="border-t pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!isValid || isSaving}>
                {isSaving && <Loader2 className="size-4 mr-2 animate-spin" />}
                {isEditing ? 'Save' : 'Create'}
              </Button>
            </SheetFooter>
          </>
        )}

        {/* ═══════ Add Preset view ═══════ */}
        {view === 'add-preset' && (
          <CuePresetPicker
            projectId={projectId}
            onConfirm={handlePresetConfirm}
            onCancel={() => setView('main')}
          />
        )}

        {/* ═══════ Edit Preset view ═══════ */}
        {view === 'edit-preset' && editingPresetIndex !== null && (
          <CuePresetPicker
            projectId={projectId}
            onConfirm={handlePresetEditConfirm}
            onCancel={() => setView('main')}
            existingPresetId={presetApps[editingPresetIndex]?.presetId}
            existingTargets={presetApps[editingPresetIndex]?.targets}
          />
        )}

        {/* ═══════ Add Effect view ═══════ */}
        {view === 'add-effect' && (
          <CueEffectFlow
            onConfirm={handleEffectConfirm}
            onCancel={() => setView('main')}
            palette={effectivePalette}
          />
        )}

        {/* ═══════ Edit Effect view ═══════ */}
        {view === 'edit-effect' && editingEffectIndex !== null && (
          <CueEffectFlow
            onConfirm={() => {}}
            onCancel={() => setView('main')}
            existingEffect={adHocEffects[editingEffectIndex]}
            onUpdate={handleEffectUpdate}
            onRemove={handleEffectRemove}
            palette={effectivePalette}
          />
        )}

      </SheetContent>
    </Sheet>
  )
}

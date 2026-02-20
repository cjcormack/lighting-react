import { useState, useEffect, useCallback, useMemo } from 'react'
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
  Plus,
  Loader2,
  X,
  Palette,
  Bookmark,
  AudioWaveform,
  Layers,
  LayoutGrid,
  Eraser,
  Globe,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffectLibraryQuery, type EffectLibraryEntry } from '@/store/fixtureFx'
import { useProjectPresetListQuery } from '@/store/fxPresets'
import { EFFECT_CATEGORY_INFO, BEAT_DIVISION_OPTIONS, getEffectDescription } from '@/components/fx/fxConstants'
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
}

export function CueForm({
  open,
  onOpenChange,
  cue,
  projectId,
  onSave,
  isSaving,
  initialState,
}: CueFormProps) {
  const { data: library } = useEffectLibraryQuery()
  const { data: presets } = useProjectPresetListQuery(projectId)

  // ── Local editing state ──
  const [name, setName] = useState('')
  const [palette, setPalette] = useState<string[]>([])
  const [updateGlobalPalette, setUpdateGlobalPalette] = useState(false)
  const [presetApps, setPresetApps] = useState<CuePresetAppLocal[]>([])
  const [adHocEffects, setAdHocEffects] = useState<CueAdHocEffect[]>([])
  const [error, setError] = useState<string | null>(null)

  // Current view inside the sheet
  const [view, setView] = useState<CueFormView>('main')

  // Index of the preset application being edited
  const [editingPresetIndex, setEditingPresetIndex] = useState<number | null>(null)

  // Index of the effect being edited
  const [editingEffectIndex, setEditingEffectIndex] = useState<number | null>(null)

  const isEditing = cue !== null

  // ── Library lookup ──
  const libraryMap = useMemo(() => {
    if (!library) return new Map<string, EffectLibraryEntry>()
    const map = new Map<string, EffectLibraryEntry>()
    for (const entry of library) {
      const normalized = entry.name.toLowerCase().replace(/[\s_]/g, '')
      map.set(`${entry.category}:${normalized}`, entry)
      map.set(normalized, entry)
    }
    return map
  }, [library])

  const findLibraryEntry = useCallback(
    (effectType: string, category?: string): EffectLibraryEntry | undefined => {
      const normalized = effectType.toLowerCase().replace(/[\s_]/g, '')
      if (category) {
        const qualified = libraryMap.get(`${category}:${normalized}`)
        if (qualified) return qualified
      }
      return libraryMap.get(normalized)
    },
    [libraryMap],
  )

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
                <SheetTitle>{isEditing ? 'Edit Cue' : 'New Cue'}</SheetTitle>
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
                  ? 'Update the cue name, palette, presets, and effects.'
                  : 'Create a new cue with a palette, presets, and ad-hoc effects.'}
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
                  placeholder="My Cue"
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
                <CuePaletteEditor palette={palette} onChange={setPalette} />

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
                  const categories = [...new Set(presetEffects.map((e) => e.category))]

                  return (
                    <div
                      key={`preset-${index}`}
                      className="flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() => handleEditPreset(index)}
                    >
                      <Bookmark className="size-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">
                            {pa.presetName ?? `Preset #${pa.presetId}`}
                          </span>
                          {/* Effect category icons */}
                          {categories.map((cat) => {
                            const info = EFFECT_CATEGORY_INFO[cat]
                            if (!info) return null
                            const CatIcon = info.icon
                            return (
                              <span key={cat} title={info.label}>
                                <CatIcon className="size-3 text-muted-foreground" />
                              </span>
                            )
                          })}
                          {presetEffects.length > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {presetEffects.length} fx
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          {/* Effect names */}
                          {presetEffects.map((fx, fi) => {
                            const catInfo = EFFECT_CATEGORY_INFO[fx.category]
                            const FxIcon = catInfo?.icon
                            return (
                              <span key={`fx-${fi}`} className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                {FxIcon && <FxIcon className="size-2.5" />}
                                {fx.effectType}
                              </span>
                            )
                          })}
                          {/* Targets */}
                          {presetEffects.length > 0 && pa.targets.length > 0 && (
                            <span className="text-[10px] text-muted-foreground">·</span>
                          )}
                          {pa.targets.map((t, ti) => (
                            <span key={`t-${ti}`} className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                              {t.type === 'group' ? (
                                <Layers className="size-2.5" />
                              ) : (
                                <LayoutGrid className="size-2.5" />
                              )}
                              {t.key}
                            </span>
                          ))}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                        {pa.targets.length} target{pa.targets.length !== 1 ? 's' : ''}
                      </Badge>
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
                    </div>
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

                {adHocEffects.map((effect, index) => {
                  const entry = findLibraryEntry(effect.effectType, effect.category)
                  const catInfo = EFFECT_CATEGORY_INFO[effect.category]
                  const CatIcon = catInfo?.icon
                  const closestBeat = BEAT_DIVISION_OPTIONS.reduce((prev, curr) =>
                    Math.abs(curr.value - effect.beatDivision) < Math.abs(prev.value - effect.beatDivision) ? curr : prev,
                  )

                  return (
                    <div
                      key={`effect-${index}`}
                      className="flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() => handleEditEffect(index)}
                    >
                      {CatIcon && <CatIcon className="size-4 text-muted-foreground shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{effect.effectType}</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            {effect.targetType === 'group' ? (
                              <Layers className="size-2.5" />
                            ) : (
                              <LayoutGrid className="size-2.5" />
                            )}
                            {effect.targetKey}
                          </span>
                          {entry && (
                            <span className="text-[10px] text-muted-foreground hidden sm:inline">
                              {getEffectDescription(entry.name, entry.description)}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                        {closestBeat.label}
                      </Badge>
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
                    </div>
                  )
                })}
              </div>
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
            palette={palette}
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
            palette={palette}
          />
        )}

      </SheetContent>
    </Sheet>
  )
}

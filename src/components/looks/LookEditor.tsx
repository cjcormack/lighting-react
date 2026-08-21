import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AudioWaveform,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Palette,
  Plus,
  Sliders,
  X,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatError } from '@/lib/formatError'

import {
  useEffectLibraryQuery,
  buildEffectLibraryLookup,
  type EffectLibraryEntry,
} from '@/store/fixtureFx'
import { useFixtureTypeListQuery, useFixtureListQuery } from '@/store/fixtures'
import type {
  SettingPropertyDescriptor,
  SliderPropertyDescriptor,
} from '@/store/fixtures'
import { EditorContextProvider } from '@/components/lighting-editor/EditorContext'
import { FixtureContent } from '@/components/fixtures/FixtureContent'
import { CuePaletteEditor } from '@/components/cues/CuePaletteEditor'
import { EffectCategoryPicker } from '@/components/fx/EffectCategoryPicker'
import { EffectTypePicker } from '@/components/fx/EffectTypePicker'
import { EffectParameterForm } from '@/components/fx/EffectParameterForm'
import { SpeedMasterChip } from '@/components/fx/SpeedMasterChip'
import { detectExtendedChannels } from '@/components/fx/colourUtils'
import {
  BEAT_DIVISION_OPTIONS,
  EFFECT_CATEGORY_INFO,
  getEffectDescription,
} from '@/components/fx/fxConstants'
import {
  FixtureTypePickerContent,
  type FixtureCountMap,
} from '@/components/fixtures/FixtureTypePicker'
import {
  buildFixtureTypeHierarchy,
  resolveFixtureTypeLabel,
} from '@/api/fixtureTypeHierarchy'
import type {
  FixtureTypeHierarchy,
  FixtureTypeMode,
} from '@/api/fixtureTypeHierarchy'
import {
  DEFERRED_TARGET_TYPE,
  isDeferred,
  type LookDetails,
  type LookEffect,
  type LookInput,
  type LookRow,
} from '@/api/looksApi'
import { LookDraftProvider } from './LookDraftContext'
import { buildSyntheticLookFixture } from './syntheticFixture'
import { DeadLookRowsBanner } from './DeadLookRowsBanner'
import { LookLivePreview } from './LookLivePreview'

const CATEGORY_ORDER = ['dimmer', 'colour', 'position', 'controls'] as const

// Maps UI categories to the fixture capability required to show them
const CATEGORY_TO_REQUIRED_CAPABILITY: Record<string, string | null> = {
  dimmer: 'dimmer',
  colour: 'colour',
  position: 'position',
  controls: null, // always available
}

type SheetView = 'form' | 'fixture-type' | 'add-effect' | 'edit-effect' | 'confirm-delete'

interface LookEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  look: LookDetails | null
  onSave: (input: LookInput) => Promise<void>
  isSaving: boolean
  /** Pre-populate the editor fixture type when creating. */
  defaultEditorFixtureType?: string | null
  /** If provided, shows a Delete button when editing an existing Look. */
  onDelete?: () => void
  isDeleting?: boolean
}

/**
 * Authoring surface for a Look's **deferred** rows and effects — the half of the library that
 * needs a value grid, because a deferred row names no target and so has no head on stage to edit
 * it on.
 *
 * A single synthetic fixture built from `editorFixtureType` drives `FixtureContent`, wrapped in an
 * `EditorContext` (`kind: 'look'`) so property writes flow into `LookDraftContext` instead of the
 * stage. That is what `editorFixtureType` is for, and why it is an editor *hint* rather than a data
 * constraint: without a type there are no property descriptors to render, but the Look's rows are
 * still applicable to anything a layer points them at.
 *
 * Bound rows are **not** shown or editable here and are round-tripped untouched on save. Editing
 * them is the record loop (Include → change on stage → Update), which is what `LookDetailSheet`
 * points at.
 *
 * Required fields: name + editor fixture type. Save disables until both are set.
 */
export function LookEditor({
  open,
  onOpenChange,
  look,
  onSave,
  isSaving,
  defaultEditorFixtureType,
  onDelete,
  isDeleting,
}: LookEditorProps) {
  const { data: fixtureTypes } = useFixtureTypeListQuery()
  const { data: fixtureList } = useFixtureListQuery()
  const { data: library } = useEffectLibraryQuery()

  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [editorFixtureType, setEditorFixtureType] = useState<string | null>(null)
  const [palette, setPalette] = useState<string[]>([])
  const [effects, setEffects] = useState<LookEffect[]>([])
  /** The deferred rows — the ones this editor owns. */
  const [rows, setRows] = useState<LookRow[]>([])
  /**
   * The Look's **bound** rows, held so `handleSave` can put them back.
   *
   * Not editable here and not displayed in the grid, but they must survive: a PUT carrying `rows`
   * replaces the lot, so writing only the deferred half would silently delete every row naming a
   * fixture — and delete it out from under every cue resolving through this Look.
   */
  const [boundRows, setBoundRows] = useState<LookRow[]>([])
  /** Bound *effects*, round-tripped for the same reason. */
  const [boundEffects, setBoundEffects] = useState<LookEffect[]>([])

  const [view, setView] = useState<SheetView>('form')
  /**
   * The last failed save, rendered inline.
   *
   * `createLook` and `saveLook` are both in `SILENT_ENDPOINTS`, so nothing toasts for them — a
   * duplicate name or a rejected row would otherwise leave the operator pressing a button that
   * appears to do nothing at all.
   */
  const [saveError, setSaveError] = useState<unknown>(null)

  const [effectStep, setEffectStep] = useState<'category' | 'effect' | 'configure'>('category')
  const [effectCategory, setEffectCategory] = useState<string | null>(null)
  const [effectEntry, setEffectEntry] = useState<EffectLibraryEntry | null>(null)
  const [effectIndex, setEffectIndex] = useState<number | null>(null)
  const [effectDraft, setEffectDraft] = useState<LookEffect | null>(null)

  /**
   * Which Look this session has already been seeded from — `null` for a create draft, `undefined`
   * while closed.
   *
   * Keyed by id rather than by the object, because `useLookQuery` hands back a fresh object every
   * time the `Look` tag is invalidated (which `lookListChanged` does for every Look in the
   * project). Re-seeding on that would silently replace whatever the operator was halfway through
   * editing, and `isDirty` would then read false so nothing would show that work had been lost.
   * Same rationale — and the same fix — as `LookDetailSheet`.
   */
  const seededLookIdRef = useRef<number | null | undefined>(undefined)

  useEffect(() => {
    if (!open) {
      seededLookIdRef.current = undefined
      return
    }
    const key = look?.id ?? null
    if (seededLookIdRef.current === key) return
    seededLookIdRef.current = key
    setSaveError(null)
    setName(look?.name ?? '')
    setNotes(look?.notes ?? '')
    setEditorFixtureType(look?.editorFixtureType ?? defaultEditorFixtureType ?? null)
    setPalette(look?.palette ?? [])
    setEffects((look?.effects ?? []).filter(isDeferred))
    setBoundEffects((look?.effects ?? []).filter((e) => !isDeferred(e)))
    setRows((look?.rows ?? []).filter(isDeferred))
    setBoundRows((look?.rows ?? []).filter((r) => !isDeferred(r)))
    setView('form')
    setEffectStep('category')
    setEffectCategory(null)
    setEffectEntry(null)
    setEffectIndex(null)
    setEffectDraft(null)
  }, [open, look, defaultEditorFixtureType])

  const hierarchy = useMemo<FixtureTypeHierarchy | null>(
    () => (fixtureTypes ? buildFixtureTypeHierarchy(fixtureTypes) : null),
    [fixtureTypes],
  )

  const fixtureTypeLabel = useMemo(() => {
    if (!editorFixtureType || !hierarchy) return null
    return resolveFixtureTypeLabel(editorFixtureType, hierarchy)
  }, [editorFixtureType, hierarchy])

  const fixtureCounts = useMemo<FixtureCountMap>(() => {
    const counts: FixtureCountMap = new Map()
    if (!fixtureList) return counts
    for (const f of fixtureList) counts.set(f.typeKey, (counts.get(f.typeKey) ?? 0) + 1)
    return counts
  }, [fixtureList])

  const selectedMode = useMemo<FixtureTypeMode | null>(() => {
    if (!editorFixtureType || !hierarchy) return null
    return hierarchy.typeKeyToModel.get(editorFixtureType)?.mode ?? null
  }, [editorFixtureType, hierarchy])

  const syntheticFixture = useMemo(
    () => (selectedMode ? buildSyntheticLookFixture(selectedMode) : null),
    [selectedMode],
  )

  const fixtureTypeCapabilities = selectedMode?.capabilities ?? null
  const isMultiHead =
    ((fixtureTypes ?? []).find((t) => t.typeKey === editorFixtureType)?.elementGroupProperties
      ?.length ?? 0) > 0

  const libraryByCategory = useMemo(() => {
    if (!library) return {} as Record<string, EffectLibraryEntry[]>
    const grouped: Record<string, EffectLibraryEntry[]> = {}
    for (const entry of library) {
      if (!grouped[entry.category]) grouped[entry.category] = []
      grouped[entry.category].push(entry)
    }
    return grouped
  }, [library])

  const hasControlsTarget = useMemo(() => {
    if (!selectedMode) return false
    return selectedMode.properties.some(
      (p) => p.type === 'setting' || (p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv'),
    )
  }, [selectedMode])

  const effectsByCategory = useMemo(() => {
    const filtered: Record<string, EffectLibraryEntry[]> = {}
    for (const cat of CATEGORY_ORDER) {
      const entries = libraryByCategory[cat]
      if (!entries || entries.length === 0) continue
      if (cat === 'controls' && !hasControlsTarget) continue
      if (fixtureTypeCapabilities) {
        const requiredCap = CATEGORY_TO_REQUIRED_CAPABILITY[cat]
        if (requiredCap && !fixtureTypeCapabilities.includes(requiredCap)) continue
      }
      filtered[cat] = entries
    }
    return filtered
  }, [libraryByCategory, fixtureTypeCapabilities, hasControlsTarget])

  const findLibraryEntry = useMemo(() => buildEffectLibraryLookup(library), [library])

  const settingProperties = useMemo(() => {
    if (!selectedMode) return [] as SettingPropertyDescriptor[]
    return selectedMode.properties.filter((p) => p.type === 'setting') as SettingPropertyDescriptor[]
  }, [selectedMode])

  const extraSliderProperties = useMemo(() => {
    if (!selectedMode) return [] as SliderPropertyDescriptor[]
    return selectedMode.properties.filter(
      (p) => p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv',
    ) as SliderPropertyDescriptor[]
  }, [selectedMode])

  const extendedChannels = useMemo(() => {
    if (!selectedMode) return { white: false, amber: false, uv: false }
    return detectExtendedChannels([selectedMode.properties])
  }, [selectedMode])

  const effectErrors = useMemo<boolean[]>(() => {
    return effects.map((effect) => {
      const entry = findLibraryEntry(effect.effectType, effect.category)
      if (!entry) return false
      const needsProp =
        entry.compatibleProperties.includes('setting') ||
        entry.compatibleProperties.includes('slider')
      if (!needsProp) return false
      if (!selectedMode) return true
      if (!effect.propertyName) return true
      return !selectedMode.properties.some((p) => {
        if (p.name !== effect.propertyName) return false
        if (entry.compatibleProperties.includes('setting') && p.type === 'setting') return true
        if (
          entry.compatibleProperties.includes('slider') &&
          p.type === 'slider' &&
          p.category !== 'dimmer' &&
          p.category !== 'uv'
        )
          return true
        if (entry.compatibleProperties.includes(p.name)) return true
        return false
      })
    })
  }, [effects, selectedMode, findLibraryEntry])

  const hasEffectErrors = effectErrors.some(Boolean)
  const isValid = name.trim().length > 0 && !!editorFixtureType && !hasEffectErrors

  /**
   * Whether there is work in here that closing would throw away.
   *
   * A whole-payload comparison rather than a rows-only one, because the PUT carries every field.
   * Only the deferred halves are compared — the bound rows and effects are round-tripped verbatim,
   * so they cannot diverge.
   *
   * A *new* Look is dirty only once something has been entered. "Unsaved" for an untouched create
   * draft would make Escape ask a question about nothing, which trains the operator to dismiss the
   * question.
   */
  const isDirty = useMemo(() => {
    if (!look) {
      return (
        name.trim() !== '' ||
        notes.trim() !== '' ||
        editorFixtureType != null ||
        palette.length > 0 ||
        effects.length > 0 ||
        rows.length > 0
      )
    }
    return (
      name.trim() !== look.name ||
      (notes.trim() || null) !== (look.notes ?? null) ||
      editorFixtureType !== look.editorFixtureType ||
      JSON.stringify(palette) !== JSON.stringify(look.palette) ||
      JSON.stringify(effects) !== JSON.stringify(look.effects.filter(isDeferred)) ||
      JSON.stringify(rows) !== JSON.stringify(look.rows.filter(isDeferred))
    )
  }, [look, name, notes, editorFixtureType, palette, effects, rows])

  // `id: 0` for new-draft sessions — the discriminator needs a number, but routing
  // never keys off it (all writes land in LookDraftContext).
  const editorContextValue = useMemo(
    () => ({ kind: 'look' as const, id: look?.id ?? 0 }),
    [look?.id],
  )

  const handleSave = async () => {
    if (!isValid) return
    // Keep the sheet open if the save failed, and say why *here*: these endpoints are silenced in
    // `errorToastMiddleware`, so an inline alert is the only report there is. Closing would discard
    // the operator's edits along with the explanation.
    setSaveError(null)
    try {
      await onSave({
        name: name.trim(),
        notes: notes.trim() || null,
        editorFixtureType,
        palette,
        // Bound rows first, then this editor's deferred ones, and `sortOrder` restated across the
        // whole list so the two halves can't collide on an index.
        rows: [...boundRows, ...rows].map((row, index) => ({ ...row, sortOrder: index })),
        effects: [...boundEffects, ...effects].map((effect, index) => ({
          ...effect,
          sortOrder: index,
        })),
      })
    } catch (err) {
      setSaveError(err)
      return
    }
    onOpenChange(false)
  }

  const openAddEffect = () => {
    setEffectStep('category')
    setEffectCategory(null)
    setEffectEntry(null)
    setEffectIndex(null)
    setEffectDraft(null)
    setView('add-effect')
  }

  const handleSelectCategory = (cat: string) => {
    setEffectCategory(cat)
    setEffectStep('effect')
  }

  const handleSelectEffect = (entry: EffectLibraryEntry) => {
    setEffectEntry(entry)
    const defaults: Record<string, string> = {}
    entry.parameters.forEach((p) => {
      defaults[p.name] = p.defaultValue
    })
    const targetPropertyName = resolveTargetPropertyName(
      entry,
      selectedMode,
      settingProperties,
      extraSliderProperties,
    )
    setEffectDraft({
      // Authored against a synthetic fixture, so it names no target: the layer applying the Look
      // supplies one.
      targetType: DEFERRED_TARGET_TYPE,
      targetKey: '',
      effectType: entry.name,
      category: entry.category,
      propertyName: targetPropertyName,
      beatDivision: 1.0,
      blendMode: 'OVERRIDE',
      distribution: 'LINEAR',
      phaseOffset: 0,
      elementMode: isMultiHead ? 'PER_FIXTURE' : null,
      elementFilter: null,
      stepTiming: null,
      parameters: defaults,
    })
    setEffectStep('configure')
  }

  const openEditEffect = (index: number) => {
    const effect = effects[index]
    if (!effect) return
    const entry = findLibraryEntry(effect.effectType, effect.category)
    setEffectCategory(effect.category)
    setEffectEntry(entry ?? null)
    setEffectIndex(index)
    setEffectDraft({ ...effect })
    setEffectStep('configure')
    setView('edit-effect')
  }

  const confirmEffect = () => {
    if (!effectDraft) return
    const resolved: LookEffect = { ...effectDraft }
    if (effectIndex == null) {
      setEffects((prev) => [...prev, resolved])
    } else {
      setEffects((prev) => {
        const next = [...prev]
        next[effectIndex] = resolved
        return next
      })
    }
    setView('form')
  }

  const removeEffect = (index: number) => {
    setEffects((prev) => prev.filter((_, i) => i !== index))
  }

  const removeEditingEffect = () => {
    if (effectIndex == null) return
    removeEffect(effectIndex)
    setView('form')
  }

  // Sheet close from within a sub-view pops back to the form instead of dismissing,
  // so the user's partially-filled effect or fixture-type pick isn't lost on stray clicks.
  const handleSheetOpenChange = useCallback(
    (value: boolean) => {
      if (!value && view !== 'form') {
        setView('form')
        return
      }
      onOpenChange(value)
    },
    [onOpenChange, view],
  )

  const formView = (
    <EditorContextProvider value={editorContextValue}>
      <LookDraftProvider assignments={rows} onChange={setRows}>
        <SheetHeader>
          <SheetTitle>{look ? 'Edit Look' : 'New Look'}</SheetTitle>
          <SheetDescription>
            A reusable bundle you point at whatever you like — rows set base values, effects
            animate on top, and a cue layer decides which fixtures they land on. The fixture type
            below only shapes this editor.
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <div className="space-y-1.5">
            <Label htmlFor="look-name">Name *</Label>
            <Input
              id="look-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Slow Pulse"
              className="h-9"
              autoFocus={!look}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="look-notes">Notes</Label>
            <Textarea
              id="look-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              rows={2}
              className="resize-none text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Editor fixture type *</Label>
            <button
              type="button"
              onClick={() => setView('fixture-type')}
              className={cn(
                'flex items-center gap-2 w-full h-9 px-3 rounded-md border text-left text-sm hover:bg-accent/50 transition-colors',
                !editorFixtureType && 'border-destructive/60',
              )}
            >
              <span
                className={
                  fixtureTypeLabel
                    ? 'flex-1 truncate'
                    : 'flex-1 truncate text-muted-foreground'
                }
              >
                {fixtureTypeLabel ?? 'Pick a fixture type…'}
              </span>
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </button>
            <p className="text-[11px] text-muted-foreground">
              Required — the property descriptors below are resolved from it. It does not restrict
              what a layer can point this Look at, but it does decide which Looks the pickers offer
              for a given head.
            </p>
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
            <CuePaletteEditor palette={palette} onChange={setPalette} />
          </div>

          <DeadLookRowsBanner
            rows={rows}
            onRemove={(index) => setRows((prev) => prev.filter((_, i) => i !== index))}
          />

          <BoundRowsNotice count={boundRows.length} />

          <LookLivePreview
            editorFixtureType={editorFixtureType}
            rows={rows}
            palette={palette}
          />

          <Tabs defaultValue="properties">
            <TabsList>
              <TabsTrigger value="properties">
                <Sliders className="size-3.5 mr-1.5" />
                Properties
                {rows.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                    {rows.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="effects">
                <AudioWaveform className="size-3.5 mr-1.5" />
                Effects
                {effects.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                    {effects.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="properties" className="pt-3">
              {syntheticFixture ? (
                <FixtureContent fixture={syntheticFixture} isEditing viewMode="properties" />
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Pick a fixture type above to edit property values.
                </p>
              )}
            </TabsContent>

            <TabsContent value="effects" className="pt-3 space-y-2">
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={openAddEffect}
                  disabled={!selectedMode}
                >
                  <Plus className="size-3" /> Add Effect
                </Button>
              </div>
              {effects.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  No effects yet. Add one to animate a property over time.
                </p>
              )}
              {effects.map((effect, index) => {
                const entry = findLibraryEntry(effect.effectType, effect.category)
                const catInfo = EFFECT_CATEGORY_INFO[effect.category]
                const CatIcon = catInfo?.icon
                const closestBeat = BEAT_DIVISION_OPTIONS.reduce((prev, curr) =>
                  Math.abs(curr.value - effect.beatDivision) < Math.abs(prev.value - effect.beatDivision)
                    ? curr
                    : prev,
                )
                const hasError = effectErrors[index]
                return (
                  <div
                    key={`${effect.effectType}-${index}`}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors',
                      hasError && 'border-destructive',
                    )}
                    onClick={() => openEditEffect(index)}
                  >
                    {CatIcon && <CatIcon className="size-4 text-muted-foreground shrink-0" />}
                    <span className="text-sm font-medium truncate">{effect.effectType}</span>
                    {effect.propertyName && !hasError && (
                      <span className="text-xs text-muted-foreground truncate">
                        &rarr; {effect.propertyName}
                      </span>
                    )}
                    {hasError && (
                      <span className="text-xs text-destructive truncate">
                        {!selectedMode
                          ? 'needs fixture type'
                          : effect.propertyName
                            ? `→ ${effect.propertyName} (invalid)`
                            : 'needs target property'}
                      </span>
                    )}
                    {!hasError && entry && (
                      <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
                        {getEffectDescription(entry.name, entry.description)}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1.5 shrink-0">
                      <SpeedMasterChip speedMasterUuid={effect.speedMasterUuid} />
                      <SpeedMasterChip speedMasterUuid={effect.rateSpeedMasterUuid} kind="rate" />
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {closestBeat.label}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeEffect(index)
                        }}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </TabsContent>
          </Tabs>
          {saveError != null && (
            <Alert variant="destructive">
              <XCircle className="size-4" />
              <AlertDescription>{formatError(saveError)}</AlertDescription>
            </Alert>
          )}
        </SheetBody>

        <SheetFooter className="flex-row justify-end gap-2">
          {look && onDelete && (
            <Button
              variant="outline"
              onClick={() => setView('confirm-delete')}
              disabled={isSaving || isDeleting}
              className="text-destructive hover:text-destructive mr-auto"
            >
              {isDeleting && <Loader2 className="size-4 mr-2 animate-spin" />}
              Delete
            </Button>
          )}
          {/* Through SheetClose, and with no onClick of its own: only a close Radix drives reaches
              the discard question, and `asChild` would run both handlers. */}
          <SheetClose asChild>
            <Button variant="outline" disabled={isSaving || isDeleting}>
              Cancel
            </Button>
          </SheetClose>
          <Button onClick={handleSave} disabled={!isValid || isSaving || isDeleting}>
            {isSaving && <Loader2 className="size-4 mr-2 animate-spin" />}
            {look ? 'Update' : 'Create'}
          </Button>
        </SheetFooter>
      </LookDraftProvider>
    </EditorContextProvider>
  )

  const effectFormView = effectDraft && (
    <>
      {effectStep !== 'configure' && (
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <button onClick={() => setView('form')} className="hover:bg-accent rounded p-0.5 -ml-1">
              <ChevronLeft className="size-5" />
            </button>
            {view === 'add-effect' ? 'Add Effect' : 'Edit Effect'}
          </SheetTitle>
        </SheetHeader>
      )}
      <SheetBody className="space-y-0 p-0">
        {view === 'add-effect' && effectStep === 'category' && (
          <EffectCategoryPicker
            effectsByCategory={effectsByCategory}
            onSelect={handleSelectCategory}
          />
        )}
        {view === 'add-effect' && effectStep === 'effect' && effectCategory && (
          <EffectTypePicker
            category={effectCategory}
            effects={effectsByCategory[effectCategory] ?? []}
            onSelect={handleSelectEffect}
            onBack={() => setEffectStep('category')}
          />
        )}
        {effectStep === 'configure' && effectEntry && (
          <EffectParameterForm
            effect={effectEntry}
            beatDivision={effectDraft.beatDivision}
            onBeatDivisionChange={(v) =>
              setEffectDraft((d) => (d ? { ...d, beatDivision: v } : d))
            }
            blendMode={effectDraft.blendMode}
            onBlendModeChange={(v) =>
              setEffectDraft((d) => (d ? { ...d, blendMode: v } : d))
            }
            phaseOffset={effectDraft.phaseOffset ?? 0}
            onPhaseOffsetChange={(v) =>
              setEffectDraft((d) => (d ? { ...d, phaseOffset: v } : d))
            }
            startOnBeat={false}
            onStartOnBeatChange={() => {}}
            showStartOnBeat={false}
            parameters={effectDraft.parameters}
            onParametersChange={(v) =>
              setEffectDraft((d) => (d ? { ...d, parameters: v } : d))
            }
            targetPropertyName={effectDraft.propertyName ?? null}
            isEdit={view === 'edit-effect'}
            onBack={view === 'add-effect' ? () => setEffectStep('effect') : undefined}
            distributionStrategy={effectDraft.distribution}
            onDistributionStrategyChange={(v) =>
              setEffectDraft((d) => (d ? { ...d, distribution: v } : d))
            }
            showDistribution
            elementMode={effectDraft.elementMode ?? 'PER_FIXTURE'}
            onElementModeChange={(v) =>
              setEffectDraft((d) => (d ? { ...d, elementMode: v } : d))
            }
            showElementMode={isMultiHead}
            elementFilter={effectDraft.elementFilter ?? 'ALL'}
            onElementFilterChange={(v) =>
              setEffectDraft((d) => (d ? { ...d, elementFilter: v === 'ALL' ? null : v } : d))
            }
            showElementFilter
            settingOptions={
              effectEntry.compatibleProperties.includes('setting') && effectDraft.propertyName
                ? settingProperties.find((sp) => sp.name === effectDraft.propertyName)?.options
                : undefined
            }
            settingProperties={
              effectEntry.compatibleProperties.includes('setting') ? settingProperties : undefined
            }
            onSettingPropertyChange={(n) =>
              setEffectDraft((d) => (d ? { ...d, propertyName: n } : d))
            }
            sliderProperties={
              effectEntry.compatibleProperties.includes('slider') ? extraSliderProperties : undefined
            }
            onSliderPropertyChange={(n) =>
              setEffectDraft((d) => (d ? { ...d, propertyName: n } : d))
            }
            extendedChannels={effectEntry.category === 'colour' ? extendedChannels : undefined}
            stepTiming={effectDraft.stepTiming ?? false}
            onStepTimingChange={(v) =>
              setEffectDraft((d) => (d ? { ...d, stepTiming: v || null } : d))
            }
            speedMasterUuid={effectDraft.speedMasterUuid ?? null}
            rateSpeedMasterUuid={effectDraft.rateSpeedMasterUuid ?? null}
            onRateSpeedMasterChange={(v) =>
              setEffectDraft((d) => (d ? { ...d, rateSpeedMasterUuid: v } : d))
            }
            onSpeedMasterChange={(v) =>
              setEffectDraft((d) => (d ? { ...d, speedMasterUuid: v } : d))
            }
            palette={palette}
          />
        )}
      </SheetBody>
      {effectStep === 'configure' && (
        <SheetFooter
          className={view === 'edit-effect' ? 'flex-row justify-between' : 'flex-row justify-end gap-2'}
        >
          {view === 'edit-effect' ? (
            <>
              <Button variant="destructive" size="sm" onClick={removeEditingEffect}>
                Remove
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setView('form')}>
                  Cancel
                </Button>
                <Button onClick={confirmEffect}>Update</Button>
              </div>
            </>
          ) : (
            <Button onClick={confirmEffect} className="w-full">
              Add Effect
            </Button>
          )}
        </SheetFooter>
      )}
    </>
  )

  return (
    /* `unsavedChanges` on the Sheet rather than `useUnsavedChanges` inside it: that hook reports
       through the Sheet's own context, so calling it from the component that *renders* the Sheet
       registers with nothing and the guard is silently dead. Escape, a click outside and the X now
       all ask before discarding — and only a close Radix drives reaches the question, which is why
       Cancel below goes through `SheetClose`. */
    <Sheet
      open={open}
      onOpenChange={handleSheetOpenChange}
      unsavedChanges={isDirty && view === 'form'}
    >
      <SheetContent side="right" className="flex flex-col sm:max-w-2xl">
        {view === 'form' && formView}
        {(view === 'add-effect' || view === 'edit-effect') && effectFormView}
        {view === 'fixture-type' && (
          <FixtureTypePickerContent
            hierarchy={hierarchy}
            fixtureCounts={fixtureCounts}
            onSelect={(typeKey) => {
              setEditorFixtureType(typeKey)
              setView('form')
            }}
            onClose={() => setView('form')}
            options={{
              subtitle: 'Required — property descriptors are resolved from the fixture type.',
            }}
          />
        )}
        {view === 'confirm-delete' && (
          <>
            <SheetHeader>
              <SheetTitle>Delete Look</SheetTitle>
              <SheetDescription>
                Are you sure you want to delete &ldquo;{look?.name}&rdquo;? This action cannot be
                undone.
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1" />
            <SheetFooter className="flex-row justify-end gap-2">
              <Button variant="outline" onClick={() => setView('form')}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setView('form')
                  onDelete?.()
                }}
              >
                Delete
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

/**
 * Says that this Look holds rows the grid below cannot show.
 *
 * Silence would be worse than a note: the grid would look like the whole Look, and Save round-trips
 * rows the operator never saw. It is deliberately not an editing affordance — a bound row is edited
 * on the head it names, not in a grid of values divorced from it.
 */
function BoundRowsNotice({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <p className="rounded-md border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
      {count === 1
        ? 'This look also holds 1 row naming its own fixture or group.'
        : `This look also holds ${count} rows naming their own fixtures or groups.`}{' '}
      They are kept as they are and are not shown here. Include the look to see them on the heads
      they name; writing edits back arrives with the record rewrite.
    </p>
  )
}

function resolveTargetPropertyName(
  entry: EffectLibraryEntry,
  mode: FixtureTypeMode | null,
  settingProperties: SettingPropertyDescriptor[],
  sliderProperties: SliderPropertyDescriptor[],
): string | null {
  if (!mode) return null
  const allPropNames = new Set(mode.properties.map((p) => p.name))
  if (mode.properties.some((p) => p.type === 'setting')) allPropNames.add('setting')
  if (
    mode.properties.some(
      (p) => p.type === 'slider' && p.category !== 'dimmer' && p.category !== 'uv',
    )
  ) {
    allPropNames.add('slider')
  }
  const matched = entry.compatibleProperties.find((n) => allPropNames.has(n)) ?? null
  if (matched === 'setting') return settingProperties[0]?.name ?? null
  if (matched === 'slider') return sliderProperties[0]?.name ?? null
  return matched
}

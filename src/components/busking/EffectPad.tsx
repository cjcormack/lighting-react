import React, { useRef } from 'react'
import { useNavigate } from 'react-router'
import { Crosshair, SwatchBook, Plus, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { EFFECT_CATEGORY_INFO, BEAT_DIVISION_OPTIONS } from '@/components/fx/fxConstants'
import { SpeedMasterSelect } from '@/components/fx/SpeedMasterSelect'
import { EffectPadButton } from './EffectPadButton'
import { PropertyPadButton } from './PropertyPadButton'
import type { EffectLibraryEntry } from '@/store/fixtureFx'
import type { EffectPresence, PropertyButton } from './buskingTypes'
import type { LookSummary } from '@/api/looksApi'

const CATEGORY_ORDER = ['looks', 'dimmer', 'colour', 'position', 'controls'] as const

interface EffectPadProps {
  effectsByCategory: Record<string, EffectLibraryEntry[]>
  getPresence: (effectName: string) => EffectPresence
  onToggle: (effect: EffectLibraryEntry) => void
  onLongPress: (effect: EffectLibraryEntry) => void
  hasSelection: boolean
  /** Content rendered at the top of the scrollable area (e.g. selected target summary) */
  headerContent?: React.ReactNode
  /**
   * The Looks a pad can toggle — **deferred ones only**, filtered by the caller. A bound Look names
   * its own fixtures, so the toggle route offers none of its rows and a pad for it would fire
   * nothing.
   */
  looks: LookSummary[]
  onApplyLook: (look: LookSummary) => Promise<void>
  getLookPresence: (look: LookSummary) => EffectPresence
  currentProjectId: number | undefined
  // Beat division
  defaultBeatDivision: number
  onBeatDivisionChange: (value: number) => void
  // Pad-wide default speed master (uuid; null → master 1)
  defaultSpeedMasterUuid: string | null
  onSpeedMasterChange: (masterUuid: string) => void
  // Property buttons (settings & sliders)
  propertyButtons: PropertyButton[]
  getPropertyPresence: (button: PropertyButton) => EffectPresence
  onPropertyToggle: (button: PropertyButton, settingLevel?: number) => void
  onPropertyLongPress: (button: PropertyButton) => void
  getPropertyValue: (button: PropertyButton) => string | null
  onCreateLook: () => void
  onEditLook: (look: LookSummary) => void
}

export function EffectPad({
  effectsByCategory,
  getPresence,
  onToggle,
  onLongPress,
  hasSelection,
  headerContent,
  looks,
  onApplyLook,
  getLookPresence,
  currentProjectId,
  defaultBeatDivision,
  onBeatDivisionChange,
  defaultSpeedMasterUuid,
  onSpeedMasterChange,
  propertyButtons,
  getPropertyPresence,
  onPropertyToggle,
  onPropertyLongPress,
  getPropertyValue,
  onCreateLook,
  onEditLook,
}: EffectPadProps) {
  if (!hasSelection) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground px-4">
        <Crosshair className="size-10 opacity-30" />
        <p className="text-sm text-center">Select a group or fixture to control effects</p>
      </div>
    )
  }

  return (
    <div className="@container flex flex-col h-full overflow-y-auto px-2 pb-2">
      {headerContent}
      {CATEGORY_ORDER.map((cat) => {
        if (cat === 'looks') {
          return (
            <React.Fragment key={cat}>
              <CategorySection label="Looks" icon={SwatchBook}>
                <LookGrid
                  looks={looks}
                  onApplyLook={onApplyLook}
                  onEditLook={onEditLook}
                  getLookPresence={getLookPresence}
                  currentProjectId={currentProjectId}
                  onCreateLook={onCreateLook}
                />
              </CategorySection>
              <hr className="border-border mt-3 mb-0" />
              <CategorySection label="Time" icon={Clock}>
                <ToggleGroup
                  type="single"
                  value={String(defaultBeatDivision)}
                  onValueChange={(v) => {
                    if (v) onBeatDivisionChange(parseFloat(v))
                  }}
                  className="h-auto gap-0.5 flex-wrap justify-start"
                >
                  {BEAT_DIVISION_OPTIONS.map((opt) => (
                    <ToggleGroupItem
                      key={opt.value}
                      value={String(opt.value)}
                      size="sm"
                      className="text-xs px-2 h-7"
                    >
                      {opt.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                {/* Pad-wide default master: one-tap applies and the configure sheet's
                    starting value both take it, so a busk can be pinned to M2 wholesale. */}
                <div className="mt-2 max-w-[16rem]">
                  <SpeedMasterSelect
                    value={defaultSpeedMasterUuid}
                    onChange={onSpeedMasterChange}
                  />
                </div>
              </CategorySection>
            </React.Fragment>
          )
        }

        if (cat === 'controls') {
          if (propertyButtons.length === 0) return null
          const info = EFFECT_CATEGORY_INFO[cat]
          if (!info) return null
          return (
            <CategorySection key={cat} label={info.label} icon={info.icon}>
              <div className="grid grid-cols-1 @[20rem]:grid-cols-2 @[28rem]:grid-cols-3 @[48rem]:grid-cols-4 gap-2">
                {propertyButtons.map((btn) => (
                  <PropertyPadButton
                    key={`${btn.kind}:${btn.propertyName}`}
                    button={btn}
                    presence={getPropertyPresence(btn)}
                    activeValue={getPropertyValue(btn)}
                    onToggle={(level) => onPropertyToggle(btn, level)}
                    onLongPress={() => onPropertyLongPress(btn)}
                  />
                ))}
              </div>
            </CategorySection>
          )
        }

        // Effect categories: dimmer, colour, position
        const effects = effectsByCategory[cat] ?? []
        if (effects.length === 0) return null
        const info = EFFECT_CATEGORY_INFO[cat]
        if (!info) return null

        return (
          <CategorySection key={cat} label={info.label} icon={info.icon}>
            <div className="grid grid-cols-1 @[20rem]:grid-cols-2 @[28rem]:grid-cols-3 @[48rem]:grid-cols-4 gap-2">
              {effects.map((effect) => (
                <EffectPadButton
                  key={effect.name}
                  effect={effect}
                  presence={getPresence(effect.name)}
                  onToggle={() => onToggle(effect)}
                  onLongPress={() => onLongPress(effect)}
                />
              ))}
            </div>
          </CategorySection>
        )
      })}
    </div>
  )
}

function CategorySection({
  label,
  icon: Icon,
  children,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="mt-3 first:mt-2">
      <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        <Icon className="size-3.5" />
        {label}
      </div>
      {children}
    </div>
  )
}

const MOVE_THRESHOLD = 10

function LookGrid({
  looks,
  onApplyLook,
  onEditLook,
  getLookPresence,
  currentProjectId,
  onCreateLook,
}: {
  looks: LookSummary[]
  onApplyLook: (look: LookSummary) => Promise<void>
  onEditLook: (look: LookSummary) => void
  getLookPresence: (look: LookSummary) => EffectPresence
  currentProjectId: number | undefined
  onCreateLook: () => void
}) {
  const navigate = useNavigate()

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 @[20rem]:grid-cols-2 @[28rem]:grid-cols-3 @[48rem]:grid-cols-4 gap-2">
        {looks.map((look) => (
          <LookPadButton
            key={look.id}
            look={look}
            presence={getLookPresence(look)}
            onToggle={() => onApplyLook(look)}
            onLongPress={() => onEditLook(look)}
          />
        ))}
        {currentProjectId && (
          <button
            onClick={onCreateLook}
            className={cn(
              'flex flex-col items-center justify-center rounded-lg border border-dashed px-2 py-3 text-center transition-all',
              'min-h-[64px] select-none touch-manipulation',
              'border-border hover:bg-accent/50 hover:border-muted-foreground/50',
              'active:scale-95',
            )}
          >
            <Plus className="size-5 text-muted-foreground mb-0.5" />
            <span className="text-xs text-muted-foreground">New Look</span>
          </button>
        )}
      </div>
      {currentProjectId && looks.length > 0 && (
        <div className="text-center pt-1">
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => navigate(`/projects/${currentProjectId}/looks`)}
          >
            Manage looks →
          </button>
        </div>
      )}
    </div>
  )
}

function LookPadButton({
  look,
  presence,
  onToggle,
  onLongPress,
}: {
  look: LookSummary
  presence: EffectPresence
  onToggle: () => void
  onLongPress: () => void
}) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)
  const didMove = useRef(false)
  const startPos = useRef<{ x: number; y: number } | null>(null)

  const handlePointerDown = (e: React.PointerEvent) => {
    didLongPress.current = false
    didMove.current = false
    startPos.current = { x: e.clientX, y: e.clientY }
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true
      if (!didMove.current) {
        onLongPress()
      }
    }, 500)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (startPos.current && !didMove.current) {
      const dx = e.clientX - startPos.current.x
      const dy = e.clientY - startPos.current.y
      if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
        didMove.current = true
        if (pressTimer.current) {
          clearTimeout(pressTimer.current)
          pressTimer.current = null
        }
      }
    }
  }

  const handlePointerUp = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
    if (!didLongPress.current && !didMove.current) {
      onToggle()
    }
    startPos.current = null
  }

  const handlePointerLeave = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
    startPos.current = null
  }

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      className={cn(
        'relative flex flex-col items-center justify-center rounded-lg border px-2 py-3 text-center transition-all',
        'min-h-[64px] select-none touch-manipulation',
        'active:scale-95',
        presence === 'none' && 'border-border bg-card hover:bg-accent/50',
        presence === 'some' && 'border-primary/40 bg-primary/10 hover:bg-primary/15',
        presence === 'all' && 'border-primary bg-primary/20 ring-1 ring-primary/50 hover:bg-primary/25',
      )}
    >
      <span
        className={cn(
          'text-sm font-medium leading-tight',
          presence !== 'none' ? 'text-primary' : 'text-foreground',
        )}
      >
        {look.name}
      </span>
      {look.notes && (
        <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground line-clamp-1">
          {look.notes}
        </span>
      )}
      <Badge variant="secondary" className="mt-1 text-[9px] px-1.5 py-0 leading-tight">
        {describeLookContents(look)}
      </Badge>
      {presence !== 'none' && (
        <div
          className={cn(
            'absolute top-1.5 right-1.5 size-2 rounded-full',
            presence === 'all' ? 'bg-primary' : 'bg-primary/50',
          )}
        />
      )}
    </button>
  )
}

/**
 * What a Look holds, in a badge's worth of text.
 *
 * Effects and rows are counted apart because they behave differently on a pad: an effect keeps
 * running until the pad is pressed again, while a static row is a value the toggle writes and holds.
 * A Look with no effects at all also never lights the pad's active ring — presence is read from the
 * running effects — so saying "2 values" rather than "0 effects" is the difference between a pad
 * that looks broken and one that looks like what it is.
 */
function describeLookContents(look: LookSummary): string {
  const parts: string[] = []
  if (look.effectCount > 0) {
    parts.push(`${look.effectCount} ${look.effectCount === 1 ? 'effect' : 'effects'}`)
  }
  if (look.rowCount > 0) {
    parts.push(`${look.rowCount} ${look.rowCount === 1 ? 'value' : 'values'}`)
  }
  return parts.length === 0 ? 'empty' : parts.join(' · ')
}

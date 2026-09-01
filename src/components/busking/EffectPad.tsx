import React, { useRef } from 'react'
import { useNavigate } from 'react-router'
import { SwatchBook, Palette, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { EFFECT_CATEGORY_INFO, BEAT_DIVISION_OPTIONS } from '@/components/fx/fxConstants'
import { EffectPadButton } from './EffectPadButton'
import { PropertyPadButton } from './PropertyPadButton'
import type { EffectLibraryEntry } from '@/store/fixtureFx'
import type { EffectPresence, PropertyButton } from './buskingTypes'
import type { LookSummary } from '@/api/looksApi'
import type { TemplateSummary } from '@/api/templatesApi'
import { templateIntentSwatch } from '@/lib/templateIntent'
import { FAMILY_LABELS, type AttributeFamily } from '@/lib/attributeFamily'
import { useIsDeskConnected } from '@/store/status'

const CATEGORY_ORDER = ['looks', 'dimmer', 'colour', 'position', 'controls'] as const

interface EffectPadProps {
  effectsByCategory: Record<string, EffectLibraryEntry[]>
  getPresence: (effectName: string) => EffectPresence
  onToggle: (effect: EffectLibraryEntry) => void
  onLongPress: (effect: EffectLibraryEntry) => void
  hasSelection: boolean
  /**
   * The named things a pad can toggle onto the selection: templates, which fill the four family
   * columns, and Looks, which get a section of their own below them.
   *
   * The Looks here are **deferred ones only**, filtered by the caller. A bound Look names its own
   * fixtures, so the toggle route offers none of its rows and a pad for it would fire nothing.
   */
  padItems: PadItem[]
  currentProjectId: number | undefined
  // Beat division
  defaultBeatDivision: number
  onBeatDivisionChange: (value: number) => void
  // Property buttons (settings & sliders)
  propertyButtons: PropertyButton[]
  getPropertyPresence: (button: PropertyButton) => EffectPresence
  onPropertyToggle: (button: PropertyButton, settingLevel?: number) => void
  onPropertyLongPress: (button: PropertyButton) => void
  getPropertyValue: (button: PropertyButton) => string | null
}

export function EffectPad({
  effectsByCategory,
  getPresence,
  onToggle,
  onLongPress,
  hasSelection,
  padItems,
  currentProjectId,
  defaultBeatDivision,
  onBeatDivisionChange,
  propertyButtons,
  getPropertyPresence,
  onPropertyToggle,
  onPropertyLongPress,
  getPropertyValue,
}: EffectPadProps) {
  // Only the *property* pads are gated. The effect pads above them add and remove FX over REST,
  // which stays usable while the socket is mid-backoff; the property pads write straight to the
  // programmer over the socket.
  const deskConnected = useIsDeskConnected()

  return (
    <div
      className={cn(
        '@container flex flex-col h-full overflow-y-auto px-2 pb-2 transition-opacity',
        // Dimmed and inert rather than replaced by a placeholder. This used to be a centred
        // "Select a group or fixture" page, which hid the entire library behind a step the
        // operator had not been shown yet — seeing what there *is* to press is most of what makes
        // a pad grid learnable. Nothing can be pressed by mistake: presence is `none` for every
        // pad with an empty selection, so there is nothing lit to release either.
        //
        // The inertness is on the *buttons*, not on this element: `pointer-events-none` here
        // would take the scroll container out of hit-testing too, so the wheel and a touch drag
        // would find no scrollable ancestor and the library the operator was just invited to
        // read would be stuck at its first screenful. Every interactive thing below is a
        // `<button>` (the pads, the beat-division toggles, the manage links), so the descendant
        // selector covers the same ground the container rule did.
        !hasSelection && 'opacity-55 select-none [&_button]:pointer-events-none',
      )}
      aria-disabled={!hasSelection || undefined}
    >
      {!hasSelection && (
        <p className="mt-2 shrink-0 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Toggle fixtures or groups above — pads apply to the selection. Lit pads are already on
          stage and stay live.
        </p>
      )}
      {CATEGORY_ORDER.map((cat) => {
        if (cat === 'looks') {
          return (
            <React.Fragment key={cat}>
              <CategorySection label="Templates" icon={Palette}>
                <TemplateColumns items={padItems} />
              </CategorySection>
              <CategorySection label="Looks" icon={SwatchBook}>
                <LookGrid
                  items={padItems.filter((i) => i.kind === 'look')}
                  currentProjectId={currentProjectId}
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
                    disabled={!deskConnected}
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

/**
 * One pad: a named thing you toggle onto the current selection.
 *
 * Deliberately not "a Look" any more. Session 3 split the library in two and **both halves belong on
 * a pad** — a template is a named value, which is exactly what a palette bank was, and a Look with
 * deferred effects is a chase you point at a selection. They share one grid because they are one
 * gesture from the operator's side; only the badge says which.
 */
export interface PadItem {
  key: string
  name: string
  notes: string | null
  /** What it holds, in a badge's worth of text. */
  detail: string
  kind: 'look' | 'template'
  /**
   * Which column a template pad lands in. Null on a Look, which spans families by nature and has
   * its own section for exactly that reason.
   */
  family: AttributeFamily | null
  /** The colour a colour template resolves to, for the pad's swatch. Null when there isn't one. */
  swatch: string | null
  presence: EffectPresence
  onToggle: () => void
  onEdit: () => void
}

/**
 * The four family columns of the template pool.
 *
 * A template is in **exactly one** family — derived from its rows, validated at the write boundary
 * — so four columns is an exact partition of the pool rather than a filter over it, and every pad
 * has one right home. That is the same fact that put the family filter on `/templates` and kept it
 * off `/looks`; here it buys the operator a spatial memory instead of a dropdown, which is what a
 * palette bank was always for.
 *
 * The order is the mock's — colour first, because it is the family a busking operator reaches for
 * most — rather than `ATTRIBUTE_FAMILIES`'. Columns render their heading even when empty, so the
 * four positions stay put as the library fills up.
 *
 * A template with a null `family` has no column and is dropped. The write boundary does not allow
 * one, so this is a guard rather than a case.
 */
const TEMPLATE_COLUMNS: readonly AttributeFamily[] = ['COLOUR', 'POSITION', 'BEAM', 'INTENSITY']

function TemplateColumns({ items }: { items: PadItem[] }) {
  const templates = items.filter((item) => item.kind === 'template')

  return (
    <div className="grid grid-cols-1 @[20rem]:grid-cols-2 @[48rem]:grid-cols-4 gap-3">
      {TEMPLATE_COLUMNS.map((family) => (
        <div key={family} className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground">
            {FAMILY_LABELS[family].singular}
          </span>
          {templates
            .filter((item) => item.family === family)
            .map((item) => (
              <LookPadButton
                key={item.key}
                item={item}
                presence={item.presence}
                onToggle={item.onToggle}
                onLongPress={item.onEdit}
              />
            ))}
        </div>
      ))}
    </div>
  )
}

function LookGrid({
  items,
  currentProjectId,
}: {
  items: PadItem[]
  currentProjectId: number | undefined
}) {
  const navigate = useNavigate()

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 @[20rem]:grid-cols-2 @[28rem]:grid-cols-3 @[48rem]:grid-cols-4 gap-2">
        {items.map((item) => (
          <LookPadButton
            key={item.key}
            item={item}
            presence={item.presence}
            onToggle={item.onToggle}
            onLongPress={item.onEdit}
          />
        ))}
      </div>
      {/* Links out rather than a "New" pad. Neither entity is authored from a pad grid: a Look is
          recorded from the programmer, and a template has a family-native editor of its own. A create
          affordance here would have to pick one, and would be the worse of two places to do it. */}
      {currentProjectId && (
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => navigate(`/projects/${currentProjectId}/templates`)}
          >
            Manage templates →
          </button>
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
  item,
  presence,
  onToggle,
  onLongPress,
}: {
  item: PadItem
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
      <span className="flex items-center gap-1.5">
        {/* Only a colour template that resolves to one colour has a swatch — see `swatch`'s
            derivation in `BuskingView`. Everything else names itself. */}
        {item.swatch && (
          <span
            aria-hidden
            className="size-3 shrink-0 rounded shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]"
            style={{ background: item.swatch }}
          />
        )}
        <span
          className={cn(
            'text-sm font-medium leading-tight',
            presence !== 'none' ? 'text-primary' : 'text-foreground',
          )}
        >
          {item.name}
        </span>
      </span>
      {item.notes && (
        <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground line-clamp-1">
          {item.notes}
        </span>
      )}
      <Badge variant="secondary" className="mt-1 text-[9px] px-1.5 py-0 leading-tight">
        {item.detail}
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
export function describeLookContents(look: LookSummary): string {
  const parts: string[] = []
  if (look.effectCount > 0) {
    parts.push(`${look.effectCount} ${look.effectCount === 1 ? 'effect' : 'effects'}`)
  }
  if (look.rowCount > 0) {
    parts.push(`${look.rowCount} ${look.rowCount === 1 ? 'value' : 'values'}`)
  }
  return parts.length === 0 ? 'empty' : parts.join(' · ')
}

/**
 * The colour a template pad draws beside its name, or null.
 *
 * The two exclusions are the ones `isOfferable` makes in `components/fx/FxColourTemplates.tsx`,
 * and for the same reason rather than by coincidence. A **per-fixture** template holds one colour
 * per head, so there is no single colour for a swatch to claim — its badge already says
 * "{n} heads", which is the honest answer. A **multi-row** template holds several, and drawing
 * `rows[0]` under a name that covers all of them would state one of them as the whole thing,
 * silently.
 *
 * `templateIntentSwatch` returns null for a non-colour intent, so the family check is implicit —
 * but a position template resolving to a hex would be a bug worth seeing rather than hiding, and
 * this stays a pure read either way: the client half of the intent grammar parses and never
 * resolves (`lib/templateIntent.ts`).
 */
export function templateSwatch(template: TemplateSummary): string | null {
  if (!template.isGeneric || template.rows.length !== 1) return null
  return templateIntentSwatch(template.rows[0].value)
}

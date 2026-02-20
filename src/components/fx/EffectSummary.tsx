import { Badge } from '@/components/ui/badge'
import { Layers, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  EFFECT_CATEGORY_INFO,
  getBeatDivisionLabel,
  getDistributionLabel,
  getElementModeLabel,
  getElementFilterLabel,
} from './fxConstants'
import { resolveColourToHex, resolveColourWithPalette } from './colourUtils'
import type { EffectSummaryData } from './effectSummaryTypes'

export interface EffectSummaryProps {
  /** Normalised effect data */
  effect: EffectSummaryData
  /** Optional target indicator (fixture/group icon + key) */
  target?: { type: 'group' | 'fixture'; key: string } | null
  /** Optional badge text (e.g. "via GroupName", element mode label) */
  badge?: string | null
  /** Running state: false dims the item */
  isRunning?: boolean
  /** Makes the component clickable with hover effect */
  onClick?: () => void
  /** Slot for action buttons rendered on the right side */
  actions?: React.ReactNode
  /** Palette for resolving palette colour refs (P1, P2, P*) */
  palette?: string[]
  className?: string
}

export function EffectSummary({
  effect,
  target,
  badge,
  isRunning,
  onClick,
  actions,
  palette,
  className,
}: EffectSummaryProps) {
  const categoryInfo = EFFECT_CATEGORY_INFO[effect.category]
  const CategoryIcon = categoryInfo?.icon
  const speedLabel = getBeatDivisionLabel(effect.beatDivision)
  const { colourSwatches, textParams } = getCustomParams(effect, palette)

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-2 rounded border text-sm',
        isRunning === false && 'opacity-50',
        onClick && 'cursor-pointer hover:bg-accent/50 transition-colors',
        className,
      )}
      onClick={onClick}
    >
      {CategoryIcon && <CategoryIcon className="size-4 text-muted-foreground shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium truncate">{effect.effectType}</span>
          {badge && (
            <Badge variant="outline" className="text-[10px] leading-tight px-1 py-0 shrink-0">
              {badge}
            </Badge>
          )}
          {target && <TargetIndicator target={target} />}
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
          <span>{speedLabel}</span>
          {effect.blendMode !== 'OVERRIDE' && (
            <>
              <Dot />
              <span className="lowercase">{effect.blendMode}</span>
            </>
          )}
          {effect.distribution && effect.distribution !== 'UNIFIED' && (
            <>
              <Dot />
              <span>{getDistributionLabel(effect.distribution)}</span>
            </>
          )}
          {effect.stepTiming && (
            <>
              <Dot />
              <span>step</span>
            </>
          )}
          {effect.phaseOffset != null && effect.phaseOffset !== 0 && (
            <>
              <Dot />
              <span>phase {effect.phaseOffset}</span>
            </>
          )}
          {effect.elementMode && (
            <>
              <Dot />
              <span>{getElementModeLabel(effect.elementMode)}</span>
            </>
          )}
          {effect.elementFilter && effect.elementFilter !== 'ALL' && (
            <>
              <Dot />
              <span>{getElementFilterLabel(effect.elementFilter)}</span>
            </>
          )}
          {colourSwatches.length > 0 && (
            <>
              <Dot />
              <span className="flex items-center gap-0.5">
                {colourSwatches.map((hex, i) => (
                  <ColourDot key={i} hex={hex} />
                ))}
              </span>
            </>
          )}
          {textParams.map((param) => (
            <span key={param.label} className="flex items-center gap-1">
              <Dot />
              <span>{param.label} {param.value}</span>
            </span>
          ))}
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-0.5 shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function TargetIndicator({ target }: { target: { type: 'group' | 'fixture'; key: string } }) {
  return (
    <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground shrink-0">
      {target.type === 'group' ? (
        <Layers className="size-3" />
      ) : (
        <LayoutGrid className="size-3" />
      )}
      {target.key}
    </span>
  )
}

function Dot() {
  return <span className="text-muted-foreground/50">&middot;</span>
}

function ColourDot({ hex }: { hex: string }) {
  return (
    <span
      className="inline-block size-2.5 rounded-full border border-border shrink-0"
      style={{ backgroundColor: hex }}
    />
  )
}

// ─── Custom parameter extraction ────────────────────────────────────────────

interface TextParam {
  label: string
  value: string
}

/**
 * Extract custom parameters for display.
 * Colour/ColourList params → flat array of hex swatches.
 * Other params → labelled text values.
 */
function getCustomParams(
  effect: EffectSummaryData,
  palette?: string[],
): { colourSwatches: string[]; textParams: TextParam[] } {
  const colourSwatches: string[] = []
  const textParams: TextParam[] = []
  const maxSwatches = 8

  for (const [name, value] of Object.entries(effect.parameters)) {
    if (!value) continue

    const paramDef = effect.parameterDefs?.find((p) => p.name === name)
    const paramType = paramDef?.type.toLowerCase()

    if (paramType === 'colour') {
      if (colourSwatches.length < maxSwatches) {
        const hex = palette ? resolveColourWithPalette(value, palette) : resolveColourToHex(value)
        colourSwatches.push(hex)
      }
    } else if (paramType === 'colourlist') {
      const colours = value.split(',').map((c) => c.trim()).filter(Boolean)
      for (const c of colours) {
        if (colourSwatches.length >= maxSwatches) break
        const hex = palette ? resolveColourWithPalette(c, palette) : resolveColourToHex(c)
        colourSwatches.push(hex)
      }
    } else {
      const label = name
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (s) => s.toUpperCase())
        .trim()
      textParams.push({ label, value })
    }
  }

  return { colourSwatches, textParams }
}

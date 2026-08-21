import { memo, type ComponentType } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Palette,
  Layers,
  AudioWaveform,
  Zap,
  Hash,
  Clock,
  type LucideProps,
} from 'lucide-react'
import { formatFadeText } from '@/lib/cueUtils'
import { formatMs } from '@/lib/formatMs'
import { resolveColourToHex } from '@/components/fx/colourUtils'
import { useEffectLibraryQuery } from '@/store/fixtureFx'
import { useLookListQuery } from '@/store/looks'
import { EffectSummary } from '@/components/fx/EffectSummary'
import { TriggerSummary } from './TriggerSummary'
import { TimingBadge } from './TimingBadge'
import { fromCueAdHocEffect } from '@/components/fx/effectSummaryTypes'
import type { Cue } from '@/api/cuesApi'

// ── Section header (shared across all detail sections) ────────────────

export function SectionHeader({
  icon: Icon,
  label,
  count,
}: {
  icon: ComponentType<LucideProps>
  label: string
  count?: number
}) {
  return (
    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
      <Icon className="size-3.5" />
      {label}
      {count != null && count > 0 && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {count}
        </Badge>
      )}
    </div>
  )
}

// ── Detail content body ───────────────────────────────────────────────

interface CueDetailContentProps {
  cue: Cue | null
  projectId: number
  /** Controls whether data queries fire (for lazy-loading). Defaults to true. */
  enabled?: boolean
}

/**
 * Reusable read-only detail body for a cue. Renders transition, notes,
 * palette, presets, effects, and script hooks sections. Used both in the
 * CueDetailSheet (slide-over) and the inline detail panel in Run view.
 */
export const CueDetailContent = memo(function CueDetailContent({
  cue,
  projectId,
  enabled = true,
}: CueDetailContentProps) {
  const { data: library } = useEffectLibraryQuery(undefined, { skip: !enabled })
  const { data: looks } = useLookListQuery({ projectId }, { skip: !enabled })

  const palette = cue?.palette ?? []
  const layers = cue?.layers ?? []
  const adHocEffects = cue?.adHocEffects ?? []
  const triggers = cue?.triggers ?? []

  const fadeText = cue ? formatFadeText(cue.fadeDurationMs, cue.fadeCurve) : ''

  if (!cue) {
    return <p className="text-sm text-muted-foreground">No cue selected.</p>
  }

  return (
    <>
      {/* ── Transition ── */}
      <div className="space-y-1.5">
        <SectionHeader icon={Clock} label="Transition" />
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <Badge variant="outline" className="font-mono">{fadeText}</Badge>
          {cue.autoAdvance && (
            <Badge
              variant="outline"
              className="border-blue-500/30 text-blue-500 bg-blue-500/10"
            >
              Auto-advance
              {cue.autoAdvanceDelayMs ? ` after ${formatMs(cue.autoAdvanceDelayMs)}` : ''}
            </Badge>
          )}
        </div>
      </div>

      {/* ── Notes ── */}
      {cue.notes && (
        <div className="space-y-1.5">
          <SectionHeader icon={Hash} label="Notes" />
          <p className="text-sm italic text-muted-foreground whitespace-pre-wrap">
            {cue.notes}
          </p>
        </div>
      )}

      {/* ── Colour List ── (the cue-scoped positional list FX params index as `P1`, not a
          named Palette entity — see PalettePanel for why the word is qualified.) */}
      {palette.length > 0 && (
        <div className="space-y-1.5">
          <SectionHeader icon={Palette} label="Colour List" count={palette.length} />
          <div className="flex flex-wrap gap-1.5">
            {palette.map((raw, i) => {
              const hex = resolveColourToHex(raw)
              return (
                <div
                  key={`${raw}-${i}`}
                  title={raw}
                  className="size-7 rounded border border-border"
                  style={{ backgroundColor: hex }}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* ── Layers ──
          A read surface, and deliberately shallow: it names each layer in order with its targets
          and timing, and does not expand the Look's own rows or effects. Rendering a full layer
          stack here is the read-renderer pass, along with the Run and Prompt Book cards. */}
      <div className="space-y-1.5">
        <SectionHeader icon={Layers} label="Layers" count={layers.length} />
        {layers.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">None.</p>
        ) : (
          layers.map((layer, index) => {
            const look = looks?.find((l) => l.id === layer.lookId)
            const enabledLayer = layer.enabled !== false
            const amount = Math.round((layer.amount ?? 1) * 100)
            return (
              <div
                key={`layer-${index}`}
                className={`flex flex-wrap items-center gap-1.5 rounded border bg-card p-2 text-xs${
                  enabledLayer ? '' : ' opacity-60'
                }`}
              >
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-mono">
                  {index + 1}
                </Badge>
                <span className="truncate font-medium">
                  {layer.lookName ?? look?.name ?? 'Look'}
                </span>
                {layer.propertyMask && (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    [{layer.propertyMask}]
                  </Badge>
                )}
                {amount !== 100 && (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    {amount}%
                  </Badge>
                )}
                {!enabledLayer && (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    off
                  </Badge>
                )}
                {layer.targets.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground">look&rsquo;s own targets</span>
                ) : (
                  layer.targets.map((t) => (
                    <Badge
                      key={`${t.type}:${t.key}`}
                      variant="outline"
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {t.key}
                    </Badge>
                  ))
                )}
                <span className="flex-1" />
                <TimingBadge
                  delayMs={layer.delayMs}
                  intervalMs={layer.intervalMs}
                  randomWindowMs={layer.randomWindowMs}
                />
              </div>
            )
          })
        )}
      </div>

      {/* ── Ad-hoc Effects ── */}
      <div className="space-y-1.5">
        <SectionHeader icon={AudioWaveform} label="Effects" count={adHocEffects.length} />
        {adHocEffects.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">None.</p>
        ) : (
          adHocEffects.map((effect, index) => (
            <EffectSummary
              key={`effect-${index}`}
              effect={fromCueAdHocEffect(effect, library)}
              target={{ type: effect.targetType, key: effect.targetKey }}
              palette={palette}
              actions={
                <TimingBadge
                  delayMs={effect.delayMs}
                  intervalMs={effect.intervalMs}
                  randomWindowMs={effect.randomWindowMs}
                />
              }
            />
          ))
        )}
      </div>

      {/* ── Script Hooks ── */}
      <div className="space-y-1.5">
        <SectionHeader icon={Zap} label="Script Hooks" count={triggers.length} />
        {triggers.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">None.</p>
        ) : (
          triggers.map((trigger, index) => (
            <TriggerSummary key={`trigger-${index}`} trigger={trigger} />
          ))
        )}
      </div>
    </>
  )
})

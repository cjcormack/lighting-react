import { memo, useMemo, type ComponentType } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Palette,
  Bookmark,
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
import { useProjectPresetListQuery } from '@/store/fxPresets'
import { EffectSummary } from '@/components/fx/EffectSummary'
import { PresetApplicationSummary } from '@/components/fx/PresetApplicationSummary'
import { TriggerSummary } from './TriggerSummary'
import { TimingBadge } from './TimingBadge'
import { fromPresetEffect, fromCueAdHocEffect } from '@/components/fx/effectSummaryTypes'
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
  const { data: presets } = useProjectPresetListQuery(projectId, { skip: !enabled })

  const palette = cue?.palette ?? []
  const presetApps = cue?.presetApplications ?? []
  const adHocEffects = cue?.adHocEffects ?? []
  const triggers = cue?.triggers ?? []

  const fadeText = useMemo(
    () => (cue ? formatFadeText(cue.fadeDurationMs, cue.fadeCurve) : ''),
    [cue?.fadeDurationMs, cue?.fadeCurve],
  )

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

      {/* ── Palette ── */}
      {palette.length > 0 && (
        <div className="space-y-1.5">
          <SectionHeader icon={Palette} label="Palette" count={palette.length} />
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

      {/* ── Preset Applications ── */}
      <div className="space-y-1.5">
        <SectionHeader icon={Bookmark} label="Presets" count={presetApps.length} />
        {presetApps.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">None.</p>
        ) : (
          presetApps.map((pa, index) => {
            const fullPreset = presets?.find((p) => p.id === pa.presetId)
            const presetEffects = fullPreset?.effects ?? []
            return (
              <PresetApplicationSummary
                key={`preset-${index}`}
                presetName={pa.presetName}
                presetId={pa.presetId}
                effects={presetEffects.map((e) => fromPresetEffect(e, library))}
                targets={pa.targets}
                palette={palette}
                actions={
                  <TimingBadge
                    delayMs={pa.delayMs}
                    intervalMs={pa.intervalMs}
                    randomWindowMs={pa.randomWindowMs}
                  />
                }
              />
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

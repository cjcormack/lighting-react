import { useMemo, type ComponentType } from 'react'
import {
  Sheet,
  SheetContent,
  SheetBody,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Palette,
  Bookmark,
  AudioWaveform,
  Zap,
  Pencil,
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

function SectionHeader({
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

// ── Sheet ──────────────────────────────────────────────────────────────

interface CueDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cue: Cue | null
  projectId: number
  /** Optional callback to jump into the edit form from the detail view. */
  onEdit?: () => void
}

/**
 * Read-only view of a cue — a lighter-weight companion to `CueForm` for
 * operators who want to inspect a cue without risking an accidental edit.
 * Shares the same summary components (PresetApplicationSummary, EffectSummary,
 * TriggerSummary) so the layout matches what the editor shows.
 */
export function CueDetailSheet({
  open,
  onOpenChange,
  cue,
  projectId,
  onEdit,
}: CueDetailSheetProps) {
  // Defer reference-data queries until the sheet is actually visible.
  const { data: library } = useEffectLibraryQuery(undefined, { skip: !open })
  const { data: presets } = useProjectPresetListQuery(projectId, { skip: !open })

  const palette = cue?.palette ?? []
  const presetApps = cue?.presetApplications ?? []
  const adHocEffects = cue?.adHocEffects ?? []
  const triggers = cue?.triggers ?? []

  const fadeText = useMemo(
    () => (cue ? formatFadeText(cue.fadeDurationMs, cue.fadeCurve) : ''),
    [cue],
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col sm:max-w-lg">
        <SheetHeader className="pr-10">
          <SheetTitle className="flex items-center gap-2">
            {cue?.name ?? 'Cue details'}
            {cue?.cueNumber && (
              <Badge variant="outline" className="font-mono text-xs">
                Q{cue.cueNumber}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>Read-only view. Click Edit to make changes.</SheetDescription>
        </SheetHeader>

        <SheetBody>
          {!cue ? (
            <p className="text-sm text-muted-foreground">No cue selected.</p>
          ) : (
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
          )}
        </SheetBody>

        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {onEdit && (
            <Button onClick={onEdit}>
              <Pencil className="size-3.5 mr-1.5" />
              Edit
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

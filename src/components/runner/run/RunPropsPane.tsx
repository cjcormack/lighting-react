import { TriggerSummary } from '@/components/cues/TriggerSummary'
import { Badge } from '@/components/ui/badge'
import { formatFadeText } from '@/lib/cueUtils'
import { formatMs } from '@/lib/formatMs'
import { resolveColourToHex } from '@/components/fx/colourUtils'
import { cn } from '@/lib/utils'
import type { Cue } from '@/api/cuesApi'

interface RunPropsPaneProps {
  cue: Cue
}

/**
 * Read-only summary of cue properties. Mirrors the prototype's "Cue properties"
 * pane: a small card with Number / Name / Palette / optional note, then
 * Transition rows (fade in/out, ease, auto-advance), then script hooks if any.
 * No editing affordances — to change anything the operator clicks "Edit Cue"
 * in the breadcrumb actions to jump to Program.
 */
export function RunPropsPane({ cue }: RunPropsPaneProps) {
  const fadeText = formatFadeText(cue.fadeDurationMs, cue.fadeCurve)

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="rounded-md border bg-muted/20 p-3 space-y-2">
        <PropRow k="Number" mono>
          {cue.cueNumber ? `Q${cue.cueNumber}` : <span className="text-muted-foreground">—</span>}
        </PropRow>
        <PropRow k="Name">{cue.name}</PropRow>
        <PropRow k="Palette">
          {cue.palette.length === 0 ? (
            <span className="text-muted-foreground">none</span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex h-4 max-w-[220px] flex-1 overflow-hidden rounded border border-border/60">
                {cue.palette.map((raw, i) => (
                  <i
                    key={`${raw}-${i}`}
                    className="block flex-1"
                    style={{ background: resolveColourToHex(raw) }}
                  />
                ))}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {cue.palette.length} colour{cue.palette.length === 1 ? '' : 's'}
              </span>
            </span>
          )}
        </PropRow>
        {cue.notes && (
          <PropRow k="Note">
            <span className="italic text-muted-foreground">{cue.notes}</span>
          </PropRow>
        )}
      </div>

      {/* Transition */}
      <div className="space-y-1.5">
        <SectionHeader label="Transition" />
        <PropRow k="Fade in" mono>
          {fadeText}
        </PropRow>
        <PropRow k="Auto-advance">
          {cue.autoAdvance ? (
            <span className="inline-flex items-center gap-1.5">
              <Badge
                variant="outline"
                className="border-blue-500/30 text-blue-400 bg-blue-500/10 text-[10px]"
              >
                On
              </Badge>
              {cue.autoAdvanceDelayMs != null && cue.autoAdvanceDelayMs > 0 && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  after {formatMs(cue.autoAdvanceDelayMs)}
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">Off</span>
          )}
        </PropRow>
      </div>

      {/* Script hooks */}
      {cue.triggers.length > 0 && (
        <div className="space-y-1.5">
          <SectionHeader label="Script hooks" count={cue.triggers.length} />
          <div className="space-y-1.5">
            {cue.triggers.map((trigger, i) => (
              <TriggerSummary key={`trigger-${i}`} trigger={trigger} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PropRow({
  k,
  mono = false,
  children,
}: {
  k: string
  mono?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-3">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        {k}
      </span>
      <span className={cn('text-[12.5px] text-foreground min-w-0', mono && 'font-mono text-[12px]')}>
        {children}
      </span>
    </div>
  )
}

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground flex items-center gap-1.5">
      {label}
      {count != null && count > 0 && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {count}
        </Badge>
      )}
    </div>
  )
}

import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Bookmark, Layers, LayoutGrid, Play, Square, Plus, X } from 'lucide-react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { formatMs } from '@/lib/formatMs'
import {
  EFFECT_CATEGORY_INFO,
  getBeatDivisionLabel,
} from '@/components/fx/fxConstants'
import { InlineEditCell, parseMs, parseBeatDivision } from './InlineEditCell'
import { EffectSummary } from '@/components/fx/EffectSummary'
import { PresetApplicationSummary } from '@/components/fx/PresetApplicationSummary'
import { TriggerSummary } from './TriggerSummary'
import { TimingBadge } from './TimingBadge'
import {
  fromPresetEffect,
  fromCueAdHocEffect,
} from '@/components/fx/effectSummaryTypes'
import type { CuePresetApplicationDetail, CueAdHocEffect, CueTriggerDetail } from '@/api/cuesApi'
import type { EffectLibraryEntry } from '@/store/fixtureFx'
import type { FxPreset } from '@/api/fxPresetsApi'

// ─── Container-query breakpoints ──────────────────────────────────────
// Columns hide/show based on the table's container width, not the viewport,
// so they adapt correctly when sidebars shrink the content area.
//
//   @[420px]  — second-tier columns (target, speed, basic timing)
//   @[580px]  — timing columns (delay, interval)
//   @[720px]  — extra timing (random window)

const CQ1 = '@[420px]:table-cell' // target, speed, trigger delay/interval
const CQ2 = '@[580px]:table-cell' // effect/preset delay, interval
const CQ3 = '@[720px]:table-cell' // random window

const CQ1_HIDE = '@[420px]:hidden' // hide mobile fallback at CQ1+
const CQ2_HIDE = '@[580px]:hidden' // hide mobile fallback at CQ2+

// ─── Shared timing field type ──────────────────────────────────────────

type TimingField = 'delayMs' | 'intervalMs' | 'randomWindowMs'

// ─── Remove button ─────────────────────────────────────────────────────

function RemoveCell({ onRemove, index }: { onRemove?: (index: number) => void; index: number }) {
  if (!onRemove) return null
  return (
    <TableCell className="w-6 p-0 text-right" onClick={(e) => e.stopPropagation()}>
      <button
        aria-label="Remove"
        className="size-6 inline-flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
        onClick={() => onRemove(index)}
      >
        <X className="size-3.5" />
      </button>
    </TableCell>
  )
}

// ─── Section header (label + optional add button) ──────────────────────

function SectionHeader({ label, onAdd }: { label: string; onAdd?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-1">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      {onAdd && (
        <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-1.5" onClick={onAdd}>
          <Plus className="size-3" />
          Add
        </Button>
      )}
    </div>
  )
}

// ─── Preset table ──────────────────────────────────────────────────────

interface PresetTableProps {
  items: CuePresetApplicationDetail[]
  onTimingChange?: (index: number, field: TimingField, value: number | null) => void
  onItemClick?: (index: number) => void
  onAdd?: () => void
  onRemove?: (index: number) => void
  palette?: string[]
  presets?: FxPreset[]
  library?: EffectLibraryEntry[]
}

function PresetTable({ items, onTimingChange, onItemClick, onRemove, presets }: PresetTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-xs">Preset</TableHead>
          <TableHead className={`hidden ${CQ1} text-xs`}>FX</TableHead>
          <TableHead className={`hidden ${CQ2} text-xs w-[5rem]`}>Delay</TableHead>
          <TableHead className={`hidden ${CQ2} text-xs w-[5rem]`}>Interval</TableHead>
          <TableHead className={`hidden ${CQ3} text-xs w-[5rem]`}>Random</TableHead>
          {onRemove && <TableHead className="w-6 p-0" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((pa, index) => {
          const fullPreset = presets?.find((p) => p.id === pa.presetId)
          const presetEffects = fullPreset?.effects ?? []
          const categories = [...new Set(presetEffects.map((e) => e.category))]

          return (
            <TableRow
              key={`preset-${index}`}
              className={onItemClick ? 'cursor-pointer' : ''}
              onClick={() => onItemClick?.(index)}
            >
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <Bookmark className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium truncate max-w-[12rem]">
                    {pa.presetName ?? `Preset #${pa.presetId}`}
                  </span>
                  {pa.targets.map((t, ti) => (
                    <span key={ti} className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
                      {t.type === 'group' ? <Layers className="size-2.5" /> : <LayoutGrid className="size-2.5" />}
                      {t.key}
                    </span>
                  ))}
                </div>
                {/* Inline fallback: show timing when columns hidden */}
                <div className={`${CQ2_HIDE} mt-0.5`}>
                  <TimingBadge delayMs={pa.delayMs} intervalMs={pa.intervalMs} randomWindowMs={pa.randomWindowMs} />
                </div>
              </TableCell>
              <TableCell className={`hidden ${CQ1}`}>
                <div className="flex items-center gap-1">
                  {categories.map((cat) => {
                    const info = EFFECT_CATEGORY_INFO[cat]
                    if (!info) return null
                    const CatIcon = info.icon
                    return <CatIcon key={cat} className="size-3 text-muted-foreground" />
                  })}
                  <span className="text-[10px] text-muted-foreground">{presetEffects.length} fx</span>
                </div>
              </TableCell>
              <TableCell className={`hidden ${CQ2}`} onClick={(e) => e.stopPropagation()}>
                {onTimingChange ? (
                  <InlineEditCell
                    value={pa.delayMs}
                    onChange={(v) => onTimingChange(index, 'delayMs', v)}
                    format={formatMs}
                    parse={parseMs}
                  />
                ) : (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {pa.delayMs ? formatMs(pa.delayMs) : '—'}
                  </span>
                )}
              </TableCell>
              <TableCell className={`hidden ${CQ2}`} onClick={(e) => e.stopPropagation()}>
                {onTimingChange ? (
                  <InlineEditCell
                    value={pa.intervalMs}
                    onChange={(v) => onTimingChange(index, 'intervalMs', v)}
                    format={formatMs}
                    parse={parseMs}
                  />
                ) : (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {pa.intervalMs ? formatMs(pa.intervalMs) : '—'}
                  </span>
                )}
              </TableCell>
              <TableCell className={`hidden ${CQ3}`} onClick={(e) => e.stopPropagation()}>
                {onTimingChange ? (
                  <InlineEditCell
                    value={pa.randomWindowMs}
                    onChange={(v) => onTimingChange(index, 'randomWindowMs', v)}
                    format={formatMs}
                    parse={parseMs}
                  />
                ) : (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {pa.randomWindowMs ? formatMs(pa.randomWindowMs) : '—'}
                  </span>
                )}
              </TableCell>
              <RemoveCell onRemove={onRemove} index={index} />
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

// ─── Effect table ──────────────────────────────────────────────────────

interface EffectTableProps {
  items: CueAdHocEffect[]
  onTimingChange?: (index: number, field: TimingField | 'beatDivision', value: number | null) => void
  onItemClick?: (index: number) => void
  onAdd?: () => void
  onRemove?: (index: number) => void
  palette?: string[]
  library?: EffectLibraryEntry[]
}

function EffectTable({ items, onTimingChange, onItemClick, onRemove }: EffectTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-xs">Effect</TableHead>
          <TableHead className={`hidden ${CQ1} text-xs`}>Target</TableHead>
          <TableHead className={`hidden ${CQ1} text-xs w-[5rem]`}>Speed</TableHead>
          <TableHead className={`hidden ${CQ2} text-xs w-[5rem]`}>Delay</TableHead>
          <TableHead className={`hidden ${CQ2} text-xs w-[5rem]`}>Interval</TableHead>
          <TableHead className={`hidden ${CQ3} text-xs w-[5rem]`}>Random</TableHead>
          {onRemove && <TableHead className="w-6 p-0" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((effect, index) => {
          const catInfo = EFFECT_CATEGORY_INFO[effect.category]
          const CatIcon = catInfo?.icon

          return (
            <TableRow
              key={`effect-${index}`}
              className={onItemClick ? 'cursor-pointer' : ''}
              onClick={() => onItemClick?.(index)}
            >
              <TableCell>
                <div className="flex items-center gap-1.5">
                  {CatIcon && <CatIcon className="size-3.5 text-muted-foreground shrink-0" />}
                  <span className="text-xs font-medium truncate max-w-[10rem]">{effect.effectType}</span>
                  {effect.blendMode !== 'OVERRIDE' && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">{effect.blendMode.toLowerCase()}</Badge>
                  )}
                </div>
                {/* Inline fallback: show target + timing when columns hidden */}
                <div className={`${CQ1_HIDE} mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground`}>
                  <span>{effect.targetType === 'group' ? <Layers className="inline size-2.5" /> : <LayoutGrid className="inline size-2.5" />} {effect.targetKey}</span>
                  <span>{getBeatDivisionLabel(effect.beatDivision)}</span>
                  <TimingBadge delayMs={effect.delayMs} intervalMs={effect.intervalMs} randomWindowMs={effect.randomWindowMs} />
                </div>
              </TableCell>
              <TableCell className={`hidden ${CQ1}`}>
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  {effect.targetType === 'group' ? <Layers className="size-3" /> : <LayoutGrid className="size-3" />}
                  {effect.targetKey}
                </span>
              </TableCell>
              <TableCell className={`hidden ${CQ1}`} onClick={(e) => e.stopPropagation()}>
                {onTimingChange ? (
                  <InlineEditCell
                    value={effect.beatDivision}
                    onChange={(v) => onTimingChange(index, 'beatDivision', v)}
                    format={getBeatDivisionLabel}
                    parse={parseBeatDivision}
                  />
                ) : (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {getBeatDivisionLabel(effect.beatDivision)}
                  </span>
                )}
              </TableCell>
              <TableCell className={`hidden ${CQ2}`} onClick={(e) => e.stopPropagation()}>
                {onTimingChange ? (
                  <InlineEditCell
                    value={effect.delayMs}
                    onChange={(v) => onTimingChange(index, 'delayMs', v)}
                    format={formatMs}
                    parse={parseMs}
                  />
                ) : (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {effect.delayMs ? formatMs(effect.delayMs) : '—'}
                  </span>
                )}
              </TableCell>
              <TableCell className={`hidden ${CQ2}`} onClick={(e) => e.stopPropagation()}>
                {onTimingChange ? (
                  <InlineEditCell
                    value={effect.intervalMs}
                    onChange={(v) => onTimingChange(index, 'intervalMs', v)}
                    format={formatMs}
                    parse={parseMs}
                  />
                ) : (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {effect.intervalMs ? formatMs(effect.intervalMs) : '—'}
                  </span>
                )}
              </TableCell>
              <TableCell className={`hidden ${CQ3}`} onClick={(e) => e.stopPropagation()}>
                {onTimingChange ? (
                  <InlineEditCell
                    value={effect.randomWindowMs}
                    onChange={(v) => onTimingChange(index, 'randomWindowMs', v)}
                    format={formatMs}
                    parse={parseMs}
                  />
                ) : (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {effect.randomWindowMs ? formatMs(effect.randomWindowMs) : '—'}
                  </span>
                )}
              </TableCell>
              <RemoveCell onRemove={onRemove} index={index} />
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

// ─── Trigger table ─────────────────────────────────────────────────────

interface TriggerTableProps {
  items: CueTriggerDetail[]
  onTimingChange?: (index: number, field: TimingField, value: number | null) => void
  onItemClick?: (index: number) => void
  onAdd?: () => void
  onRemove?: (index: number) => void
}

const TRIGGER_ICONS = { ACTIVATION: Play, DEACTIVATION: Square } as const

function TriggerTable({ items, onTimingChange, onItemClick, onRemove }: TriggerTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-xs">Hook</TableHead>
          <TableHead className={`hidden ${CQ1} text-xs w-[5rem]`}>Delay</TableHead>
          <TableHead className={`hidden ${CQ1} text-xs w-[5rem]`}>Interval</TableHead>
          <TableHead className={`hidden ${CQ2} text-xs w-[5rem]`}>Random</TableHead>
          {onRemove && <TableHead className="w-6 p-0" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((trigger, index) => {
          const Icon = TRIGGER_ICONS[trigger.triggerType] ?? Play

          return (
            <TableRow
              key={`trigger-${index}`}
              className={onItemClick ? 'cursor-pointer' : ''}
              onClick={() => onItemClick?.(index)}
            >
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <Icon className="size-3.5 text-muted-foreground shrink-0" />
                  <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                    {trigger.triggerType === 'ACTIVATION' ? 'act' : 'deact'}
                  </Badge>
                  <span className="text-xs truncate max-w-[12rem]">
                    {trigger.scriptName ?? `Script #${trigger.scriptId}`}
                  </span>
                </div>
                {/* Inline fallback: show timing when columns hidden */}
                <div className={`${CQ1_HIDE} mt-0.5`}>
                  <TimingBadge delayMs={trigger.delayMs} intervalMs={trigger.intervalMs} randomWindowMs={trigger.randomWindowMs} />
                </div>
              </TableCell>
              <TableCell className={`hidden ${CQ1}`} onClick={(e) => e.stopPropagation()}>
                {onTimingChange ? (
                  <InlineEditCell
                    value={trigger.delayMs}
                    onChange={(v) => onTimingChange(index, 'delayMs', v)}
                    format={formatMs}
                    parse={parseMs}
                  />
                ) : (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {trigger.delayMs ? formatMs(trigger.delayMs) : '—'}
                  </span>
                )}
              </TableCell>
              <TableCell className={`hidden ${CQ1}`} onClick={(e) => e.stopPropagation()}>
                {onTimingChange ? (
                  <InlineEditCell
                    value={trigger.intervalMs}
                    onChange={(v) => onTimingChange(index, 'intervalMs', v)}
                    format={formatMs}
                    parse={parseMs}
                  />
                ) : (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {trigger.intervalMs ? formatMs(trigger.intervalMs) : '—'}
                  </span>
                )}
              </TableCell>
              <TableCell className={`hidden ${CQ2}`} onClick={(e) => e.stopPropagation()}>
                {onTimingChange ? (
                  <InlineEditCell
                    value={trigger.randomWindowMs}
                    onChange={(v) => onTimingChange(index, 'randomWindowMs', v)}
                    format={formatMs}
                    parse={parseMs}
                  />
                ) : (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {trigger.randomWindowMs ? formatMs(trigger.randomWindowMs) : '—'}
                  </span>
                )}
              </TableCell>
              <RemoveCell onRemove={onRemove} index={index} />
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

// ─── Card fallbacks (narrow viewports) ─────────────────────────────────

function PresetCards({ items, onItemClick, onRemove, palette, presets, library }: PresetTableProps) {
  return (
    <div className="space-y-1.5">
      {items.map((pa, index) => {
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
            onClick={onItemClick ? () => onItemClick(index) : undefined}
            actions={
              <>
                <TimingBadge delayMs={pa.delayMs} intervalMs={pa.intervalMs} randomWindowMs={pa.randomWindowMs} />
                {onRemove && (
                  <button
                    className="size-6 flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive shrink-0"
                    onClick={(e) => { e.stopPropagation(); onRemove(index) }}
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </>
            }
          />
        )
      })}
    </div>
  )
}

function EffectCards({ items, onItemClick, onRemove, palette, library }: EffectTableProps) {
  return (
    <div className="space-y-1.5">
      {items.map((effect, index) => (
        <EffectSummary
          key={`effect-${index}`}
          effect={fromCueAdHocEffect(effect, library)}
          target={{ type: effect.targetType, key: effect.targetKey }}
          palette={palette}
          onClick={onItemClick ? () => onItemClick(index) : undefined}
          actions={
            <>
              <TimingBadge delayMs={effect.delayMs} intervalMs={effect.intervalMs} randomWindowMs={effect.randomWindowMs} />
              {onRemove && (
                <button
                  className="size-6 flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive shrink-0"
                  onClick={(e) => { e.stopPropagation(); onRemove(index) }}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </>
          }
        />
      ))}
    </div>
  )
}

function TriggerCards({ items, onItemClick, onRemove }: TriggerTableProps) {
  return (
    <div className="space-y-1.5">
      {items.map((trigger, index) => (
        <TriggerSummary
          key={`trigger-${index}`}
          trigger={trigger}
          onClick={onItemClick ? () => onItemClick(index) : undefined}
          onRemove={onRemove ? () => onRemove(index) : undefined}
        />
      ))}
    </div>
  )
}

// ─── Main orchestrator ────────────────────────────────────────────────

export type CueFxTableVariant = 'presets' | 'effects' | 'triggers'

interface CueFxTableBaseProps {
  onItemClick?: (index: number) => void
  onAdd?: () => void
  onRemove?: (index: number) => void
  palette?: string[]
  library?: EffectLibraryEntry[]
  presets?: FxPreset[]
}

interface CueFxTablePresetsProps extends CueFxTableBaseProps {
  variant: 'presets'
  items: CuePresetApplicationDetail[]
  onTimingChange?: (index: number, field: TimingField, value: number | null) => void
}

interface CueFxTableEffectsProps extends CueFxTableBaseProps {
  variant: 'effects'
  items: CueAdHocEffect[]
  onTimingChange?: (index: number, field: TimingField | 'beatDivision', value: number | null) => void
}

interface CueFxTableTriggersProps extends CueFxTableBaseProps {
  variant: 'triggers'
  items: CueTriggerDetail[]
  onTimingChange?: (index: number, field: TimingField, value: number | null) => void
}

export type CueFxTableProps = CueFxTablePresetsProps | CueFxTableEffectsProps | CueFxTableTriggersProps

const VARIANT_LABELS: Record<CueFxTableVariant, string> = {
  presets: 'Presets',
  effects: 'Effects',
  triggers: 'Script Hooks',
}

export function CueFxTable(props: CueFxTableProps) {
  const isWide = useMediaQuery('(min-width: 640px)')
  const hasItems = props.items.length > 0

  // Show section even when empty if onAdd is provided (so user can add)
  if (!hasItems && !props.onAdd) return null

  const header = (isWide || props.onAdd) ? (
    <SectionHeader label={VARIANT_LABELS[props.variant]} onAdd={props.onAdd} />
  ) : null

  if (!hasItems) return header

  if (isWide) {
    return (
      <div className="@container">
        {header}
        {props.variant === 'presets' && <PresetTable {...props} />}
        {props.variant === 'effects' && <EffectTable {...props} />}
        {props.variant === 'triggers' && <TriggerTable {...props} />}
      </div>
    )
  }

  return (
    <div>
      {header}
      {props.variant === 'presets' && <PresetCards {...props} />}
      {props.variant === 'effects' && <EffectCards {...props} />}
      {props.variant === 'triggers' && <TriggerCards {...props} />}
    </div>
  )
}
